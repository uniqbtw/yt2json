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
        text: string;
        seconds: number;
    };
    views: string;
}
export interface ChannelShorts {
    title: string;
    id: string;
    url: string;
    thumbnail: string;
    views: string;
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
    videos: ChannelVideo[];
    shorts: ChannelShorts[];
    unlisted: boolean;
    familySafe: boolean;
    country: string;
    viewCount: string;
}

/**
 * Get full information about a YouTube channel.
 */
export const channelInfo = async (
    url: string,
    options: ChannelInfoOptions = {}
) => {
    if (typeof url !== "string") {
        throw new Error(constants.errors.type("url", "string", typeof url));
    }
    if (typeof options !== "object") {
        throw new Error(
            constants.errors.type("options", "object", typeof options)
        );
    }

    options = mergeObj(
        {
            // includeVideos: false,
        },
        options
    );
    if (!url.startsWith("http")) {
        url = constants.urls.channel.base(url);
    }

    let data: string;
    try {
        const resp = await request(url+`?hl=en`, options.requestOptions);
        assertUndiciOkResponse(resp);
        data = await resp.body.text();
        cookieJar.utilizeResponseHeaders(resp.headers);
    } catch (err) {
        throw new Error(`Failed to fetch url "${url}". (${err})`);
    }

    let initialData: any;
    try {
        const raw = contentBetween(data, "var ytInitialData = ", ";</script>");
        initialData = JSON.parse(raw);
    } catch (err) {
        throw new Error(`Failed to parse data from webpage. (${err})`);
    }

    // VIDEOS
    data = ""
    try {
        const resp = await request(url+`/videos?hl=en`, options.requestOptions);
        assertUndiciOkResponse(resp);
        data = await resp.body.text();
        cookieJar.utilizeResponseHeaders(resp.headers);
    } catch (err) {
        throw new Error(`Failed to fetch url "${url}". (${err})`);
    }
    let initialDataVideos: any;
    try {
        const raw = contentBetween(data, "var ytInitialData = ", ";</script>");
        initialDataVideos = JSON.parse(raw);
    } catch (err) {
        throw new Error(`Failed to parse data from webpage. (${err})`);
    }

    // SHORTS
    data = ""
    try {
        const resp = await request(url+`/shorts?hl=en`, options.requestOptions);
        assertUndiciOkResponse(resp);
        data = await resp.body.text();
        cookieJar.utilizeResponseHeaders(resp.headers);
    } catch (err) {
        throw new Error(`Failed to fetch url "${url}". (${err})`);
    }
    let initialDataShorts: any;
    try {
        const raw = contentBetween(data, "var ytInitialData = ", ";</script>");
        initialDataShorts = JSON.parse(raw);
    } catch (err) {
        throw new Error(`Failed to parse data from webpage. (${err})`);
    }

// ABOUT    
    data = ""
    try {
        const resp = await request(url+`/about?hl=en`, options.requestOptions);
        assertUndiciOkResponse(resp);
        data = await resp.body.text();
        cookieJar.utilizeResponseHeaders(resp.headers);
    } catch (err) {
        throw new Error(`Failed to fetch url "${url}". (${err})`);
    }
    let initialDataAbout: any;
    try {
        const raw = contentBetween(data, "var ytInitialData = ", ";</script>");
        initialDataAbout = JSON.parse(raw);
    } catch (err) {
        throw new Error(`Failed to parse data from webpage. (${err})`);
    }


    const bannerCount =
        initialData?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel
            ?.banner?.imageBannerViewModel?.image.sources?.length;
    const channel: ChannelInfo = {
        name: initialData?.metadata?.channelMetadataRenderer?.title,
        id: initialData?.metadata?.channelMetadataRenderer?.externalId,
        url: initialData?.metadata?.channelMetadataRenderer?.channelUrl,
        rssUrl: initialData?.metadata?.channelMetadataRenderer?.rssUrl,
        vanityUrl:
            initialData?.header?.pageHeaderRenderer?.content.pageHeaderViewModel
                ?.metadata?.contentMetadataViewModel?.metadataRows[0]
                ?.metadataParts[0]?.text?.content,
        description:
            initialData?.metadata?.channelMetadataRenderer?.description,
        subscribers:
         initialData?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel?.metadata?.contentMetadataViewModel?.metadataRows[1]?.metadataParts[0]?.text?.content?.split(
                " "
             )[0],
            // initialData?.header.pageHeaderRenderer.content.pageHeaderViewModel.metadata.contentMetadataViewModel.metadataRows[1].metadataParts[0].accessibilityLabel, //.split(
            //     " "
            // )[0],
        banner: initialData?.header?.pageHeaderRenderer?.content
            ?.pageHeaderViewModel?.banner?.imageBannerViewModel?.image?.sources[
            bannerCount - 1
        ].url,
        avatar:
            initialData?.metadata?.channelMetadataRenderer.avatar?.thumbnails[0]
                .url,
        tags: parseYoutubeKeywords(
            initialData?.metadata?.channelMetadataRenderer?.keywords ?? ""
        ),
        videos: [],
        shorts: [],
        links: [],
        unlisted: initialData?.microformat?.microformatDataRenderer?.unlisted,
        familySafe:
            initialData?.metadata?.channelMetadataRenderer?.isFamilySafe,
        // firstLink:
        //     initialData?.header.pageHeaderRenderer.content.pageHeaderViewModel
        //         .attribution.attributionViewModel.text.content,
        videosCount:
            initialDataAbout?.onResponseReceivedEndpoints[0]?.showEngagementPanelEndpoint?.engagementPanel?.engagementPanelSectionListRenderer?.content?.sectionListRenderer?.contents[0]?.
        itemSectionRenderer?.contents[0]?.aboutChannelRenderer?.metadata?.aboutChannelViewModel?.
        videoCountText?.split(
                " "
             )[0],
        viewCount:
            initialDataAbout?.onResponseReceivedEndpoints[0]?.showEngagementPanelEndpoint?.engagementPanel?.engagementPanelSectionListRenderer?.content?.sectionListRenderer?.contents[0]?.
        itemSectionRenderer?.contents[0]?.aboutChannelRenderer?.metadata?.aboutChannelViewModel?.
        viewCountText?.split(
                " "
             )[0],
        country: initialDataAbout?.onResponseReceivedEndpoints[0]?.showEngagementPanelEndpoint?.engagementPanel?.engagementPanelSectionListRenderer?.content?.sectionListRenderer?.contents[0]?.
        itemSectionRenderer?.contents[0]?.aboutChannelRenderer?.metadata?.aboutChannelViewModel?.
        country,
    };
    
    if (options.includeVideos) {
        initialDataVideos?.contents?.twoColumnBrowseResultsRenderer?.tabs
            ?.find((x: any) => x?.tabRenderer?.title === "Videos")
            ?.tabRenderer?.content?.richGridRenderer?.contents?.forEach(
                (item: any) => {
                    const value =
                        item?.richItemRenderer?.content?.videoRenderer;
                    const duration = value?.lengthText?.simpleText;
                    let seconds;
                    if (
                        value?.lengthText?.simpleText.split(":").map(Number)
                            .length === 3
                    ) {
                        seconds =
                            value?.lengthText?.simpleText
                                .split(":")
                                .map(Number)[0] *
                                3600 +
                            value?.lengthText?.simpleText
                                .split(":")
                                .map(Number)[1] *
                                60 +
                            value?.lengthText?.simpleText
                                .split(":")
                                .map(Number)[2];
                    } else {
                        seconds =
                            value?.lengthText?.simpleText
                                .split(":")
                                .map(Number)[0] *
                                60 +
                            value?.lengthText?.simpleText
                                .split(":")
                                .map(Number)[1];
                    }
                    const video: ChannelVideo = {
                        title: value?.title?.runs[0].text,
                        id: value?.videoId,
                        url: `https://youtu.be/${value?.videoId}`,
                        thumbnail: `https://i.ytimg.com/vi_webp/${value?.videoId}/maxresdefault.webp`,
                            // value?.thumbnail?.thumbnails[
                            //     value?.thumbnail?.thumbnails.length - 1
                            // ].url,
                        duration: {
                            text: duration,
                            seconds: seconds,
                        },
                        views: value?.viewCountText?.simpleText.split(" ")[0],
                    };
                    if (video.id !== undefined) {
                        channel.videos.push(video);
                    }
                    
                }
            );




        initialDataShorts?.contents?.twoColumnBrowseResultsRenderer?.tabs
            ?.find((x: any) => x?.tabRenderer?.title === "Shorts")
            ?.tabRenderer?.content?.richGridRenderer?.contents?.forEach(
                (item: any) => {
                    const value =
                        item?.richItemRenderer?.content?.shortsLockupViewModel               
                    const short: ChannelShorts = {
                        title: value?.overlayMetadata?.primaryText?.content,
                        id: value?.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId,
                        url: `https://youtu.be/${value?.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId}`,
                        thumbnail: `https://i.ytimg.com/vi_webp/${value?.videoId}/maxresdefault.webp`,
                            // value?.onTap?.innertubeCommand?.reelWatchEndpoint?.thumbnail?.thumbnails[
                            //     value?.onTap?.innertubeCommand?.reelWatchEndpoint?.thumbnail?.thumbnails.length - 1
                            // ].url,
                        views: value?.overlayMetadata?.secondaryText?.content?.split(" ")[0],
                    };
                    if (short.id !== undefined) {
                        channel.shorts.push(short);
                    }
                }
            );
    }

    let linksArray = initialDataAbout?.onResponseReceivedEndpoints[0]?.showEngagementPanelEndpoint?.engagementPanel?.engagementPanelSectionListRenderer?.content?.sectionListRenderer?.contents[0]?.
          itemSectionRenderer?.contents[0]?.aboutChannelRenderer?.metadata?.aboutChannelViewModel?.
         links

    linksArray?.forEach((item: any) => {
    const link = item?.channelExternalLinkViewModel;

    const linkItem = {
        title: link?.title?.content,
        url: link?.link?.content,
        favicon: link?.favicon?.sources[link?.favicon?.sources.length - 1].url,
    };
        channel.links.push(linkItem);
});
    return channel;
};

export default channelInfo;
