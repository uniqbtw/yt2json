import { request } from "undici";
import { cookieJar } from "./cookies";
import {
    UndiciRequestOptions,
    assertUndiciOkResponse,
    constants,
    contentBetween,
    mergeObj,
    parseYoutubeKeywords,
} from "./utils";

export interface ChannelInfoOptions {
    requestOptions?: UndiciRequestOptions;
    includeVideos?: boolean;
}

export interface ChannelVideo {
    title: string;
    id: string;
    url: string;
    thumbnail: string;
    duration: {
        text: string | null;
        seconds: number | null;
    };
    views?: string;
    publishedTime?: string;
}
export interface ChannelShorts {
    title: string;
    id: string;
    url: string;
    thumbnail: string;
    views?: string;
}
export interface LinksArray {
    title: string;
    url: string;
    favicon: string;
}

export interface ChannelInfo {
    name: string;
    id: string;
    url: string;
    rssUrl: string;
    vanityUrl: string;
    description: string;
    subscribers: string;
    avatar: string;
    links: LinksArray[];
    banner: string;
    tags: string[];
    videosCount: number;
    joinedDate?: string;
    videos: ChannelVideo[];
    shorts: ChannelShorts[];
    streams: ChannelVideo[];
    unlisted: boolean;
    familySafe: boolean;
    country: string;
    viewCount: string;
}

const lastOf = (arr: any): any =>
    Array.isArray(arr) && arr.length ? arr[arr.length - 1] : undefined;

const durationRegex = /^\d+(?::\d+){1,2}$/;
const viewsRegex = /^[\d.,]+[KMB]?\s+views?$/i;
const publishedRegex = /\bago\b|^(?:Premier|Stream|Schedul)/i;

/**
 * Turns a duration badge (`"11:36"`, `"1:02:07"`) into seconds. Live streams and
 * premieres carry a non-numeric badge (or none at all), hence the nullable seconds.
 */
const parseDuration = (text: any): ChannelVideo["duration"] => {
    if (typeof text !== "string" || !durationRegex.test(text)) {
        return { text: typeof text === "string" ? text : null, seconds: null };
    }
    const seconds = text
        .split(":")
        .map(Number)
        .reduce((acc, x) => acc * 60 + x, 0);
    return { text, seconds };
};

const parseDurationBadge = (lockup: any) => {
    const overlays = lockup?.contentImage?.thumbnailViewModel?.overlays;
    if (!Array.isArray(overlays)) return undefined;
    for (const overlay of overlays) {
        const badges = overlay?.thumbnailBottomOverlayViewModel?.badges;
        if (!Array.isArray(badges)) continue;
        for (const badge of badges) {
            const text = badge?.thumbnailBadgeViewModel?.text;
            if (typeof text === "string") return text;
        }
    }
    return undefined;
};

/**
 * The metadata rows aren't positional: collaborators occupy a row of their own and
 * YouTube Originals carry a badge row with no view count at all, so every part is
 * scanned and matched by shape instead of by index.
 */
const parseLockupMetadata = (rows: any) => {
    const parsed: { views?: string; publishedTime?: string } = {};
    if (!Array.isArray(rows)) return parsed;
    for (const row of rows) {
        for (const part of row?.metadataParts ?? []) {
            const content = part?.text?.content;
            if (typeof content !== "string") continue;
            if (!parsed.views && viewsRegex.test(content)) {
                parsed.views = content.split(" ")[0];
            } else if (!parsed.publishedTime && publishedRegex.test(content)) {
                parsed.publishedTime = content;
            }
        }
    }
    return parsed;
};

const parseLockupVideo = (lockup: any): ChannelVideo | null => {
    const id = lockup?.contentId;
    if (
        typeof id !== "string" ||
        lockup?.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO"
    ) {
        return null;
    }
    const { views, publishedTime } = parseLockupMetadata(
        lockup?.metadata?.lockupMetadataViewModel?.metadata
            ?.contentMetadataViewModel?.metadataRows
    );
    return {
        title: lockup?.metadata?.lockupMetadataViewModel?.title?.content,
        id,
        url: `https://youtu.be/${id}`,
        thumbnail: `https://i.ytimg.com/vi_webp/${id}/maxresdefault.webp`,
        duration: parseDuration(parseDurationBadge(lockup)),
        views,
        publishedTime,
    };
};

const parseShortsLockup = (lockup: any): ChannelShorts | null => {
    let id = lockup?.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId;
    if (
        typeof id !== "string" &&
        typeof lockup?.entityId === "string" &&
        lockup.entityId.startsWith("shorts-shelf-item-")
    ) {
        id = lockup.entityId.slice("shorts-shelf-item-".length);
    }
    if (typeof id !== "string" || !id.length) return null;
    return {
        title: lockup?.overlayMetadata?.primaryText?.content,
        id,
        url: `https://youtu.be/${id}`,
        thumbnail:
            lastOf(
                lockup?.thumbnailViewModel?.thumbnailViewModel?.image?.sources
            )?.url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        views: lockup?.overlayMetadata?.secondaryText?.content?.split(" ")[0],
    };
};

/**
 * The requested tab is always the selected one, which avoids matching against
 * localized tab titles.
 */
const findSelectedGrid = (initialData: any) =>
    initialData?.contents?.twoColumnBrowseResultsRenderer?.tabs?.find(
        (x: any) => x?.tabRenderer?.selected
    )?.tabRenderer?.content?.richGridRenderer;

const gridContinuationToken = (contents: any): string | undefined =>
    lastOf(contents)?.continuationItemRenderer?.continuationEndpoint
        ?.continuationCommand?.token;

/**
 * A tab a channel doesn't have still answers with 200 (falling back to its home
 * page), so the tab bar decides whether fetching it is worth a request at all.
 */
const hasTab = (initialData: any, tab: string) => {
    const tabs = initialData?.contents?.twoColumnBrowseResultsRenderer?.tabs;
    // Unknown layout - better to try the tab than to silently drop it.
    if (!Array.isArray(tabs) || !tabs.length) return true;
    return tabs.some((x: any) =>
        x?.tabRenderer?.endpoint?.commandMetadata?.webCommandMetadata?.url?.endsWith(
            `/${tab}`
        )
    );
};

/**
 * Get full information about a YouTube channel.
 */
export const channelInfo = async (
    url: string,
    options: ChannelInfoOptions | boolean | string = {}
) => {
    if (typeof url !== "string") {
        throw new Error(constants.errors.type("url", "string", typeof url));
    }
    if (
        typeof options !== "object" &&
        typeof options !== "boolean" &&
        typeof options !== "string"
    ) {
        throw new Error(
            constants.errors.type("options", "object", typeof options)
        );
    }

    // Channel URLs (handles especially) answer with a redirect, so redirects have to
    // be followed or `assertUndiciOkResponse` rejects the 303.
    const defaults: ChannelInfoOptions = {
        requestOptions: {
            headers: {
                "User-Agent": constants.requestOptions.userAgent,
            },
            maxRedirections: constants.requestOptions.maxRedirections,
        },
    };
    // Accepts the legacy positional flag (including the raw string of a query
    // parameter) alongside the options object.
    const opts = mergeObj(
        defaults,
        typeof options === "object"
            ? options
            : { includeVideos: options === true || options === "true" }
    );

    if (!url.startsWith("http")) {
        url = constants.urls.channel.base(url);
    }

    const fetchTab = async (tab?: string) => {
        const tabUrl = constants.urls.channel.tab(url, tab);
        let html: string;
        try {
            const resp = await request(tabUrl, opts.requestOptions);
            assertUndiciOkResponse(resp);
            html = await resp.body.text();
            cookieJar.utilizeResponseHeaders(resp.headers);
        } catch (err) {
            throw new Error(`Failed to fetch url "${tabUrl}". (${err})`);
        }
        try {
            return {
                html,
                initialData: JSON.parse(
                    contentBetween(html, "var ytInitialData = ", ";</script>")
                ),
            };
        } catch (err) {
            throw new Error(`Failed to parse data from webpage. (${err})`);
        }
    };

    /**
     * Walks the grid's continuation tokens through the innertube browse endpoint
     * until the channel is exhausted, mirroring `playlistInfo`.
     */
    const collectContinuations = async (
        html: string,
        contents: any,
        collect: (item: any) => void
    ) => {
        let token = gridContinuationToken(contents);
        if (!token) return;

        const { INNERTUBE_API_KEY, INNERTUBE_CLIENT_VERSION } = JSON.parse(
            '{"INNERTUBE_API_KEY":' +
                contentBetween(
                    html,
                    '"INNERTUBE_API_KEY":',
                    ',"INNERTUBE_CONTEXT":'
                ) +
                "}"
        );

        while (token) {
            const resp = await request(
                constants.urls.channel.continuation(INNERTUBE_API_KEY),
                {
                    ...opts.requestOptions,
                    method: "POST",
                    headers: {
                        ...opts.requestOptions?.headers,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        continuation: token,
                        context: {
                            client: {
                                utcOffsetMinutes: 0,
                                gl: "US",
                                hl: "en",
                                clientName: "WEB",
                                clientVersion: INNERTUBE_CLIENT_VERSION,
                            },
                            user: {},
                            request: {},
                        },
                    }),
                }
            );
            assertUndiciOkResponse(resp);
            const data = (await resp.body.json()) as any;

            token = undefined;
            for (const action of data?.onResponseReceivedActions ?? []) {
                const items =
                    action?.appendContinuationItemsAction?.continuationItems;
                if (!Array.isArray(items)) continue;
                for (const item of items) {
                    collect(item);
                }
                token = gridContinuationToken(items) ?? token;
            }
        }
    };

    // The about tab serves the channel metadata, header and tab bar alongside its own
    // panel, so the root page would be a second copy of what's already here.
    const { initialData } = await fetchTab("about");
    if (!initialData?.metadata?.channelMetadataRenderer) {
        // Non-channel URLs (marketing pages a handle may redirect to) still carry an
        // `ytInitialData`, which would otherwise yield an all-undefined result.
        throw new Error(`Url "${url}" did not resolve to a channel page.`);
    }

    const bannerSources =
        initialData?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel
            ?.banner?.imageBannerViewModel?.image?.sources;
    const headerMetadataRows =
        initialData?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel
            ?.metadata?.contentMetadataViewModel?.metadataRows;
    const about =
        initialData?.onResponseReceivedEndpoints?.[0]
            ?.showEngagementPanelEndpoint?.engagementPanel
            ?.engagementPanelSectionListRenderer?.content?.sectionListRenderer
            ?.contents?.[0]?.itemSectionRenderer?.contents?.[0]
            ?.aboutChannelRenderer?.metadata?.aboutChannelViewModel;

    const channel: ChannelInfo = {
        name: initialData?.metadata?.channelMetadataRenderer?.title,
        id: initialData?.metadata?.channelMetadataRenderer?.externalId,
        url: initialData?.metadata?.channelMetadataRenderer?.channelUrl,
        rssUrl: initialData?.metadata?.channelMetadataRenderer?.rssUrl,
        vanityUrl:
            headerMetadataRows?.[0]?.metadataParts?.[0]?.text?.content,
        description:
            initialData?.metadata?.channelMetadataRenderer?.description,
        subscribers: headerMetadataRows?.[1]?.metadataParts?.[0]?.text?.content?.split(
            " "
        )[0],
        banner: lastOf(bannerSources)?.url,
        avatar: lastOf(
            initialData?.metadata?.channelMetadataRenderer?.avatar?.thumbnails
        )?.url,
        tags: parseYoutubeKeywords(
            initialData?.metadata?.channelMetadataRenderer?.keywords ?? ""
        ),
        videos: [],
        shorts: [],
        streams: [],
        links: [],
        unlisted: initialData?.microformat?.microformatDataRenderer?.unlisted,
        familySafe:
            initialData?.metadata?.channelMetadataRenderer?.isFamilySafe,
        videosCount: parseInt(
            String(about?.videoCountText ?? "").replace(/[^\d]/g, "")
        ),
        // Reported as "Joined Mar 21, 2008" - the label is dropped, the date kept.
        joinedDate:
            typeof about?.joinedDateText?.content === "string"
                ? about.joinedDateText.content.replace(/^Joined\s+/i, "")
                : undefined,
        viewCount: about?.viewCountText?.split(" ")[0],
        country: about?.country,
    };

    /**
     * Reads one grid tab in full - first page plus every continuation - into `into`.
     */
    const collectTab = async <T>(
        tab: string,
        renderer: string,
        parse: (lockup: any) => T | null,
        into: T[]
    ) => {
        if (!hasTab(initialData, tab)) return;
        const { html, initialData: tabData } = await fetchTab(tab);
        const contents = findSelectedGrid(tabData)?.contents;
        const collect = (item: any) => {
            const parsed = parse(item?.richItemRenderer?.content?.[renderer]);
            if (parsed) into.push(parsed);
        };
        for (const item of contents ?? []) {
            collect(item);
        }
        await collectContinuations(html, contents, collect);
    };

    if (opts.includeVideos) {
        await collectTab(
            "videos",
            "lockupViewModel",
            parseLockupVideo,
            channel.videos
        );
        await collectTab(
            "shorts",
            "shortsLockupViewModel",
            parseShortsLockup,
            channel.shorts
        );
        // Past and upcoming live streams live on their own tab, but use the very
        // same lockup shape as regular videos.
        await collectTab(
            "streams",
            "lockupViewModel",
            parseLockupVideo,
            channel.streams
        );
    }

    for (const item of about?.links ?? []) {
        const link = item?.channelExternalLinkViewModel;
        channel.links.push({
            title: link?.title?.content,
            url: link?.link?.content,
            favicon: lastOf(link?.favicon?.sources)?.url,
        });
    }

    return channel;
};

export default channelInfo;
