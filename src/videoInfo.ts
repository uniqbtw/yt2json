import { request } from "undici";
import {
    UndiciRequestOptions,
    assertUndiciOkResponse,
    constants,
    contentBetween,
    mergeObj,
} from "./utils";
import { cookieJar } from "./cookies";
import { prepareStreamInfo } from "./extractStreamInfo";

export interface VideoInfoOptions {
    requestOptions?: UndiciRequestOptions;
}

export interface VideoFormat {
    /**
     * Used to check if stream was passed through `getFormats()`.
     */
    __decoded?: boolean;

    itag?: number;
    /**
     * This will be `undefined`, if `getFormats()` is not called upon this.
     */
    url: string;
    mimeType?: string;
    bitrate?: number;
    width?: number;
    height?: number;
    initRange?: {
        start: string;
        end: string;
    };
    indexRange?: {
        start: string;
        end: string;
    };
    lastModified?: string;
    contentLength?: string;
    quality?: string;
    fps?: number;
    qualityLabel?: string;
    projectionType?: string;
    averageBitrate?: number;
    approxDurationMs?: string;
    colorInfo?: {
        primaries: string;
        transferCharacteristics: string;
        matrixCoefficients: string;
    };
    highReplication?: boolean;
    audioQuality?: string;
    audioSampleRate?: string;
    audioChannels?: number;
    loudnessDb?: number;
    targetDurationSec?: number;
    maxDvrDurationSec?: number;
    signatureCipher?: string;
}

export interface VideoStream {
    expiresInSeconds: string;
    formats: VideoFormat[];
    adaptiveFormats: VideoFormat[];
    dashManifestUrl?: string;
    hlsManifestUrl?: string;
    player?: {
        url: string;
    };
}

export interface VideoInfo {
    title: string;
    id: string;
    url: string;
    shortDescription: string;
    description: string;
    channel: {
        name: string;
        id: string;
        url: string;
        subscribers: {
            pretty: string;
        };
        icons: {
            url: string;
            width: number;
            height: number;
        }[];
    };
    duration: {
        lengthSec: string;
    };
    thumbnails: {
        url: string;
        width: number;
        height: number;
    }[];
    ratings: {
        likes: {
            text: string;
            pretty: string;
        };
        dislikes: {
            text: string;
            pretty: string;
        };
    };
    views: {
        text: string;
        pretty: string;
    };
    published: {
        text: string;
        pretty: string;
    };
    uploaded: {
        text: string;
    };
    aisummary: string;
    keywords: string[];
    isLive: boolean;
    isUnlisted: boolean;
    isFamilySafe: boolean;
    category: string;
    embed: {
        iframeUrl: string;
        flashUrl: string;
        height: number;
        width: number;
        flashSecureUrl: string;
    };
    stream: VideoStream;
}


export interface videoDetails {
    title: string;
    id: string;
    url: string;
    thumbnail: string;
    duration: string;
    views: string;
    published: {
      date: string;
      datetime: string;
    },
    description: string;
    aisummary: string;
    keywords: string;
    category: string;
    maxQuality: string;
    fps: string;
}

export interface authorDetails {
    id: string;
    name: string;
    subsribers: string;
    url: string;
    avatar: string;
}


/**
 * Get full information about a YouTube video.
 */
export const videoInfo = async (
    url: string,
    options: VideoInfoOptions = {}
) => {
    if (typeof url !== "string") {
        throw new Error(constants.errors.type("url", "string", typeof url));
    }
    if (typeof options !== "object") {
        throw new Error(
            constants.errors.type("options", "object", typeof options)
        );
    }
    
    options = mergeObj({}, options);

    if (!url.startsWith("http")) {
        url = constants.urls.video.base(url);
    }

    let data: string;
    try {
        const resp = await request(url+`&hl=en`, options.requestOptions);
        assertUndiciOkResponse(resp);
        data = await resp.body.text();
        cookieJar.utilizeResponseHeaders(resp.headers);
    } catch (err) {
        throw new Error(`Failed to fetch url "${url}". (${err})`);
    }

    let initialData: any;
    try {
        const initialDataRaw = contentBetween(
            data,
            "var ytInitialData = ",
            ";</script>"
        );
        initialData = JSON.parse(initialDataRaw);
    } catch (err) {
        throw new Error(`Failed to parse data from webpage. (${err})`);
    }
    // return initialData;


let initialPlayer: any;

try {
    const match: RegExpMatchArray | null = data.match(/ytInitialPlayerResponse\s*=\s*(\{.*?\})\s*;/);

    if (!match || !match[1]) {
        throw new Error("ytInitialPlayerResponse not found");
    }

    initialPlayer = JSON.parse(match[1]) as Record<string, unknown>;
} catch (err) {
    throw new Error(
        `Failed to parse player data from webpage. (${err instanceof Error ? err.message : err})`
    );
}


    let contents: any[];
    try {
        contents =
            initialData?.contents?.twoColumnWatchNextResults?.results?.results
                ?.contents;
    } catch (err) {
        throw new Error(`Failed to parse contents from webpage. (${err})`);
    }

    let primary: any;
    try {
        primary = contents?.find(
            (x: any) => x?.videoPrimaryInfoRenderer
        )?.videoPrimaryInfoRenderer;
    } catch (err) {}

    let secondary: any;
    try {
        secondary = contents?.find(
            (x: any) => x?.videoSecondaryInfoRenderer
        )?.videoSecondaryInfoRenderer;
    } catch (err) {}

    const info: VideoInfo = {
        title: primary?.title?.runs[0]?.text,
        id: initialData?.currentVideoEndpoint?.watchEndpoint?.videoId,
        url:
            constants.urls.base +
            initialData?.currentVideoEndpoint?.commandMetadata
                ?.webCommandMetadata?.url,
        shortDescription: initialPlayer?.videoDetails?.shortDescription,
        description: secondary?.description?.runs
            ?.map((x: any) => x?.text)
            ?.join(""),
        channel: {
            name: secondary?.owner?.videoOwnerRenderer?.title?.runs[0]?.text,
            id: secondary?.owner?.videoOwnerRenderer?.title?.runs[0]
                ?.navigationEndpoint?.browseEndpoint?.browseId,
            url:
                constants.urls.base +
                secondary?.owner?.videoOwnerRenderer?.title?.runs[0]
                    ?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl,
            subscribers: {
                pretty: secondary?.owner?.videoOwnerRenderer
                    ?.subscriberCountText?.simpleText,
            },
            icons: secondary?.owner?.videoOwnerRenderer?.thumbnail?.thumbnails,
        },
        duration: {
            lengthSec: initialPlayer?.videoDetails?.lengthSeconds,
        },
        thumbnails: initialPlayer?.videoDetails?.thumbnail?.thumbnails,
        ratings: {
            likes: {
                text: primary?.videoActions?.menuRenderer?.topLevelButtons?.find(
                    (x: any) =>
                        x?.toggleButtonRenderer?.defaultIcon?.iconType ===
                        "LIKE"
                )?.toggleButtonRenderer?.defaultText?.accessibility
                    ?.accessibilityData?.label,
                pretty: primary?.videoActions?.menuRenderer?.topLevelButtons?.find(
                    (x: any) =>
                        x?.toggleButtonRenderer?.defaultIcon?.iconType ===
                        "LIKE"
                )?.toggleButtonRenderer?.defaultText?.simpleText,
            },
            dislikes: {
                text: primary?.videoActions?.menuRenderer?.topLevelButtons?.find(
                    (x: any) =>
                        x?.toggleButtonRenderer?.defaultIcon?.iconType ===
                        "DISLIKE"
                )?.toggleButtonRenderer?.defaultText?.accessibility
                    ?.accessibilityData?.label,
                pretty: primary?.videoActions?.menuRenderer?.topLevelButtons?.find(
                    (x: any) =>
                        x?.toggleButtonRenderer?.defaultIcon?.iconType ===
                        "DISLIKE"
                )?.toggleButtonRenderer?.defaultText?.simpleText,
            },
        },
        views: {
            text: primary?.viewCount?.videoViewCountRenderer?.viewCount
                ?.simpleText,
            pretty: primary?.viewCount?.videoViewCountRenderer?.shortViewCount
                ?.simpleText,
        },
        published: {
            pretty: primary?.dateText?.simpleText,
            text: initialPlayer?.microformat?.playerMicroformatRenderer
                ?.publishDate,
        },
        uploaded: {
            text: initialPlayer?.microformat?.playerMicroformatRenderer
                ?.uploadDate,
        },
        keywords: initialPlayer?.videoDetails?.keywords,
        aisummary: initialData?.engagementPanels[4]?.engagementPanelSectionListRenderer?.content?.
        structuredDescriptionContentRenderer?.items[2]?.expandableMetadataRenderer?.header?.
        collapsedTitle?.simpleText,
        isLive: initialPlayer?.videoDetails?.isLiveContent,
        isUnlisted:
            initialPlayer?.microformat?.playerMicroformatRenderer?.isUnlisted,
        isFamilySafe:
            initialPlayer?.microformat?.playerMicroformatRenderer?.isFamilySafe,
        category:
            initialPlayer?.microformat?.playerMicroformatRenderer?.category,
        embed: initialPlayer?.microformat?.playerMicroformatRenderer?.embed,
        stream: initialPlayer?.streamingData,
    };
    prepareStreamInfo(data, info.stream);

    const videoDetails = {
        title: info.title,
        id: info.id,
        url: info.url,
        thumbnail: `https://i.ytimg.com/vi_webp/${info.id}/maxresdefault.webp`,
        duration: info.duration.lengthSec,
        views: info.views.text.split(" ")[0],
        published: {
            date: info.published.pretty,
            datetime: info.published.text
        },
        description: info.shortDescription,
        aisummary: info?.aisummary,
        keywords: info.keywords,
        category: info.category,
        maxQuality: info?.stream?.adaptiveFormats[0]?.qualityLabel,
        fps: info?.stream?.adaptiveFormats[0]?.fps,
    }
    const authorDetails = {
      id: info.channel.id,
      name: info.channel.name,
      subsribers: info.channel.subscribers.pretty.split(" ")[0],
      url: info.channel.url,
    };
    return {videoDetails, authorDetails};
};

export default videoInfo;
