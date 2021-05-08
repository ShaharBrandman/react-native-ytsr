const util = require('./utils.js');
const path = require('react-native-path');
const fs = require('rn-fetch-blob/fs').default;

const BASE_VIDEO_URL = 'https://www.youtube.com/watch?v=';
const prepImg = util.prepImg;

const parseItem = (item, resp) => {
  const type = Object.keys(item)[0];

  switch (type) {
    // Regular Content or Multi-Content
    case 'videoRenderer':
      return parseVideo(item[type]);
    case 'channelRenderer':
      return parseChannel(item[type]);
    case 'playlistRenderer':
      return parsePlaylist(item[type]);
    case 'radioRenderer':
      return parseMix(item[type]);
    case 'gridMovieRenderer':
      return parseGridMovie(item[type]);
    case 'gridVideoRenderer':
      return parseVideo(item[type]);
    case 'movieRenderer':
      return parseMovie(item[type]);
    case 'shelfRenderer':
    case 'richShelfRenderer':
      return parseShelf(item[type]);
    case 'showRenderer':
      return parseShow(item[type]);

    // Change resp#refinements or resp#resultsFor
    case 'didYouMeanRenderer':
      // YouTube advises another query
      return parseDidYouMeanRenderer(item[type], resp);
    case 'showingResultsForRenderer':
      // The results are for another query
      return parseShowingResultsFor(item, resp);
    case 'horizontalCardListRenderer':
      return parseHorizontalCardListRenderer(item[type], resp);

    // Message-Types
    case 'backgroundPromoRenderer':
      if (util.parseText(item[type].title) === 'No results found') return null;
      throw new Error('unknown message in backgroundPromoRenderer');
    case 'messageRenderer':
      // Skip all messages, since "no more results" changes with the language
      return null;
    case 'clarificationRenderer':
      return parseClarification(item[type]);

    // Skip Adds for now
    case 'carouselAdRenderer':
    case 'searchPyvRenderer':
    case 'promotedVideoRenderer':
    case 'promotedSparklesTextSearchRenderer':
      return null;
    // Skip emergencyOneboxRenderer (for now?)
    case 'emergencyOneboxRenderer':
      // Emergency Notifications like: Thinking about suicide? Call xxxx
      return null;

    // For debugging purpose
    case 'debug#previewCardRenderer':
      return parseHorizontalChannelListItem(item[type]);

    // New type & file without json until now => save
    default:
      throw new Error(`type ${type} is not known`);
  }
};

const catchAndLogFunc = (func, params = []) => {
  if (!Array.isArray(params)) throw new Error('params has to be an (optionally empty) array');
  try {
    return func(...params);
  } catch (e) {
    const dir = path.resolve(__dirname, '../dumps/');
    const file = path.resolve(dir, `${Math.random().toString(36).substr(3)}-${Date.now()}.txt`);
    const cfg = path.resolve(__dirname, '../package.json');
    const bugsRef = require(cfg).bugs.url;

    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    fs.writeFileSync(file, JSON.stringify(params, null, 2));
    /* eslint-disable no-console */
    console.error(e.stack);
    console.error(`\n/${'*'.repeat(200)}`);
    console.error(`failed at func ${func.name}: ${e.message}`);
    console.error(`pls post the the files in ${dir} to ${bugsRef}`);
    let info = `os: ${process.platform}-${process.arch}, `;
    info += `node.js: ${process.version}, `;
    info += `ytpl: ${require('../package.json').version}`;
    console.error(info);
    console.error(`${'*'.repeat(200)}\\`);
    /* eslint-enable no-console */
    return null;
  }
};
const main = module.exports = (...params) => catchAndLogFunc(parseItem, params);
main._hidden = { catchAndLogFunc, parseItem };

// TYPES:
const parseVideo = obj => {
  const author = obj.ownerText && obj.ownerText.runs[0];
  let authorUrl = null;
  if (author) {
    authorUrl = author.navigationEndpoint.browseEndpoint.canonicalBaseUrl ||
      author.navigationEndpoint.commandMetadata.webCommandMetadata.url;
  }
  const badges = Array.isArray(obj.badges) ? obj.badges.map(a => a.metadataBadgeRenderer.label) : [];
  const isLive = badges.some(b => b === 'LIVE NOW');
  const upcoming = obj.upcomingEventData ? Number(`${obj.upcomingEventData.startTime}000`) : null;
  const authorImg = !author ? null : obj.channelThumbnailSupportedRenderers.channelThumbnailWithLinkRenderer;
  const isOfficial = !!(obj.ownerBadges && JSON.stringify(obj.ownerBadges).includes('OFFICIAL'));
  const isVerified = !!(obj.ownerBadges && JSON.stringify(obj.ownerBadges).includes('VERIFIED'));
  const lengthFallback = obj.thumbnailOverlays.find(x => Object.keys(x)[0] === 'thumbnailOverlayTimeStatusRenderer');
  const length = obj.lengthText || (lengthFallback && lengthFallback.thumbnailOverlayTimeStatusRenderer.text);

  return {
    type: 'video',
    title: util.parseText(obj.title, ''),
    id: obj.videoId,
    url: BASE_VIDEO_URL + obj.videoId,
    bestThumbnail: prepImg(obj.thumbnail.thumbnails)[0],
    thumbnails: prepImg(obj.thumbnail.thumbnails),
    isUpcoming: !!upcoming,
    upcoming,
    isLive,
    badges,

    // Author can be null for shows like whBqghP5Oow
    author: author ? {
      name: author.text,
      channelID: author.navigationEndpoint.browseEndpoint.browseId,
      url: new URL(authorUrl, BASE_VIDEO_URL).toString(),
      bestAvatar: prepImg(authorImg.thumbnail.thumbnails)[0],
      avatars: prepImg(authorImg.thumbnail.thumbnails),
      ownerBadges: Array.isArray(obj.ownerBadges) ? obj.ownerBadges.map(a => a.metadataBadgeRenderer.tooltip) : [],
      verified: isOfficial || isVerified,
    } : null,

    description: util.parseText(obj.descriptionSnippet),

    views: !obj.viewCountText ? null : util.parseIntegerFromText(obj.viewCountText),
    // Duration not provided for live & sometimes with upcoming & sometimes randomly
    duration: util.parseText(length),
    // UploadedAt not provided for live & upcoming & sometimes randomly
    uploadedAt: util.parseText(obj.publishedTimeText),
  };
};

const parseChannel = obj => {
  const targetUrl = obj.navigationEndpoint.browseEndpoint.canonicalBaseUrl ||
    obj.navigationEndpoint.commandMetadata.webCommandMetadata.url;
  const isOfficial = !!(obj.ownerBadges && JSON.stringify(obj.ownerBadges).includes('OFFICIAL'));
  const isVerified = !!(obj.ownerBadges && JSON.stringify(obj.ownerBadges).includes('VERIFIED'));

  return {
    type: 'channel',
    name: util.parseText(obj.title, ''),
    channelID: obj.channelId,
    url: new URL(targetUrl, BASE_VIDEO_URL).toString(),
    bestAvatar: prepImg(obj.thumbnail.thumbnails)[0],
    avatars: prepImg(obj.thumbnail.thumbnails),
    verified: isOfficial || isVerified,

    subscribers: util.parseText(obj.subscriberCountText),
    descriptionShort: util.parseText(obj.descriptionSnippet),
    videos: obj.videoCountText ? util.parseIntegerFromText(obj.videoCountText) : null,
  };
};

const parsePlaylist = obj => ({
  type: 'playlist',
  title: util.parseText(obj.title, ''),
  playlistID: obj.playlistId,
  url: `https://www.youtube.com/playlist?list=${obj.playlistId}`,
  firstVideo: Array.isArray(obj.videos) && obj.videos.length > 0 ? {
    id: obj.navigationEndpoint.watchEndpoint.videoId,
    shortURL: BASE_VIDEO_URL + obj.navigationEndpoint.watchEndpoint.videoId,
    url: new URL(obj.navigationEndpoint.commandMetadata.webCommandMetadata.url, BASE_VIDEO_URL).toString(),
    title: util.parseText(obj.videos[0].childVideoRenderer.title, ''),
    length: util.parseText(obj.videos[0].childVideoRenderer.lengthText, ''),
    thumbnails: prepImg(obj.thumbnails[0].thumbnails),
    bestThumbnail: prepImg(obj.thumbnails[0].thumbnails)[0],
  } : null,

  // Some Playlists starting with OL only provide a simple string
  owner: obj.shortBylineText.simpleText ? null : _parseOwner(obj),

  publishedAt: util.parseText(obj.publishedTimeText),
  length: Number(obj.videoCount),
});

const parseMix = obj => ({
  type: 'mix',
  title: util.parseText(obj.title, ''),
  url: new URL(obj.navigationEndpoint.commandMetadata.webCommandMetadata.url, BASE_VIDEO_URL).toString(),

  firstVideo: {
    id: obj.navigationEndpoint.watchEndpoint.videoId,
    shortURL: BASE_VIDEO_URL + obj.navigationEndpoint.watchEndpoint.videoId,
    url: new URL(obj.navigationEndpoint.commandMetadata.webCommandMetadata.url, BASE_VIDEO_URL).toString(),
    text: util.parseText(obj.videos[0].childVideoRenderer.title, ''),
    length: util.parseText(obj.videos[0].childVideoRenderer.lengthText, ''),
    thumbnails: prepImg(obj.thumbnail.thumbnails),
    bestThumbnail: prepImg(obj.thumbnail.thumbnails)[0],
  },
});

const parseDidYouMeanRenderer = (obj, resp) => {
  // Add as the first item in refinements
  if (resp && Array.isArray(resp.refinements)) {
    resp.refinements.unshift({
      q: util.parseText(obj.correctedQuery, ''),
      url: new URL(obj.correctedQueryEndpoint.commandMetadata.webCommandMetadata.url, BASE_VIDEO_URL).toString(),
      bestThumbnail: null,
      thumbnails: null,
    });
  }
  return null;
};

const parseShowingResultsFor = (obj, resp) => {
  // Add as resultsFor
  const cor = obj.showingResultsForRenderer.correctedQuery || obj.correctedQuery;
  if (resp) resp.correctedQuery = util.parseText(cor);
  return null;
};

const parseClarification = obj => ({
  type: 'clarification',
  title: util.parseText(obj.contentTitle, ''),
  text: util.parseText(obj.text, ''),
  sources: [
    {
      text: util.parseText(obj.source, ''),
      url: new URL(obj.endpoint.urlEndpoint.url, BASE_VIDEO_URL).toString(),
    },
    !obj.secondarySource ? null : {
      text: util.parseText(obj.secondarySource, ''),
      url: new URL(obj.secondaryEndpoint.urlEndpoint.url, BASE_VIDEO_URL).toString(),
    },
  ].filter(a => a),
});

const parseHorizontalCardListRenderer = (obj, resp) => {
  const subType = Object.keys(obj.cards[0])[0];

  switch (subType) {
    case 'searchRefinementCardRenderer':
      return parseHorizontalRefinements(obj, resp);
    case 'previewCardRenderer':
      return parseHorizontalChannelList(obj);
    default:
      throw new Error(`subType ${subType} of type horizontalCardListRenderer not known`);
  }
};

const parseHorizontalRefinements = (obj, resp) => {
  // Add to refinements
  if (resp && Array.isArray(resp.refinements)) {
    resp.refinements.push(...obj.cards.map(c => {
      const targetUrl = c.searchRefinementCardRenderer.searchEndpoint.commandMetadata.webCommandMetadata.url;
      return {
        q: util.parseText(c.searchRefinementCardRenderer.query, ''),
        url: new URL(targetUrl, BASE_VIDEO_URL).toString(),
        bestThumbnail: prepImg(c.searchRefinementCardRenderer.thumbnail.thumbnails)[0],
        thumbnails: prepImg(c.searchRefinementCardRenderer.thumbnail.thumbnails),
      };
    }));
  }
  return null;
};

const parseHorizontalChannelList = obj => {
  if (!JSON.stringify(obj.style).includes('CHANNELS')) {
    // Not sure if this is always a channel + videos
    throw new Error(`unknown style in horizontalCardListRenderer`);
  }
  return {
    type: 'horizontalChannelList',
    title: util.parseText(obj.header.richListHeaderRenderer.title, ''),
    channels: obj.cards.map(i => parseHorizontalChannelListItem(i.previewCardRenderer)).filter(a => a),
  };
};

const parseHorizontalChannelListItem = obj => {
  const thumbnailRenderer = obj.header.richListHeaderRenderer.channelThumbnail.channelThumbnailWithLinkRenderer;
  return {
    type: 'channelPreview',
    name: util.parseText(obj.header.richListHeaderRenderer.title, ''),
    channelID: obj.header.richListHeaderRenderer.endpoint.browseEndpoint.browseId,
    url: new URL(
      obj.header.richListHeaderRenderer.endpoint.commandMetadata.webCommandMetadata.url,
      BASE_VIDEO_URL,
    ).toString(),
    bestAvatar: prepImg(thumbnailRenderer.thumbnail.thumbnails)[0],
    avatars: prepImg(thumbnailRenderer.thumbnail.thumbnails),
    subscribers: util.parseText(obj.header.richListHeaderRenderer.subtitle, ''),
    // Type: gridVideoRenderer
    videos: obj.contents.map(i => parseVideo(i.gridVideoRenderer)).filter(a => a),
  };
};

const parseGridMovie = obj => ({
  // Movie which can be found in horizontalMovieListRenderer
  type: 'gridMovie',
  title: util.parseText(obj.title),
  videoID: obj.videoId,
  url: new URL(obj.navigationEndpoint.commandMetadata.webCommandMetadata.url, BASE_VIDEO_URL).toString(),
  bestThumbnail: prepImg(obj.thumbnail.thumbnails)[0],
  thumbnails: prepImg(obj.thumbnail.thumbnails),
  duration: util.parseText(obj.lengthText),
});

const parseMovie = obj => {
  // Normalize
  obj.bottomMetadataItems = (obj.bottomMetadataItems || []).map(x => util.parseText(x));
  const actorsString = obj.bottomMetadataItems.find(x => x.startsWith('Actors'));
  const directorsString = obj.bottomMetadataItems.find(x => x.startsWith('Director'));

  return {
    type: 'movie',
    title: util.parseText(obj.title, ''),
    videoID: obj.videoId,
    url: new URL(obj.navigationEndpoint.commandMetadata.webCommandMetadata.url, BASE_VIDEO_URL).toString(),
    bestThumbnail: prepImg(obj.thumbnail.thumbnails)[0],
    thumbnails: prepImg(obj.thumbnail.thumbnails),

    owner: _parseOwner(obj),
    description: util.parseText(obj.descriptionSnippet),
    meta: util.parseText(obj.topMetadataItems[0], '').split(' · '),
    actors: !actorsString ? [] : actorsString.split(': ')[1].split(', '),
    directors: !directorsString ? [] : directorsString.split(': ')[1].split(', '),
    duration: util.parseText(obj.lengthText, ''),
  };
};

const parseShow = obj => {
  const thumbnails = obj.thumbnailRenderer.showCustomThumbnailRenderer.thumbnail.thumbnails;
  const owner = _parseOwner(obj);
  delete owner.ownerBadges;
  delete owner.verified;

  return {
    type: 'show',
    title: util.parseText(obj.title, ''),
    bestThumbnail: prepImg(thumbnails)[0],
    thumbnails: prepImg(thumbnails),
    url: new URL(obj.navigationEndpoint.commandMetadata.webCommandMetadata.url, BASE_VIDEO_URL).toString(),
    videoID: obj.navigationEndpoint.watchEndpoint.videoId,
    playlistID: obj.navigationEndpoint.watchEndpoint.playlistId,
    episodes: util.parseIntegerFromText(obj.thumbnailOverlays[0].thumbnailOverlayBottomPanelRenderer.text),
    owner,
  };
};

const parseShelf = obj => {
  let rawItems = [];
  if (Array.isArray(obj.contents)) {
    rawItems = obj.contents.map(x => x.richItemRenderer.content);
  } else {
    rawItems = (obj.content.verticalListRenderer || obj.content.horizontalMovieListRenderer).items;
  }
  // Optional obj.thumbnail is ignored
  return {
    type: 'shelf',
    title: util.parseText(obj.title, 'Show More'),
    items: rawItems.map(i => parseItem(i)).filter(a => a),
  };
};

/**
 * Generalised Method
 *
 * used in Playlist, Movie and Show
 * show does never provide badges thou
 *
 * @param {Object} obj the full Renderer Object provided by YouTube
 * @returns {Object} the parsed owner
 */
const _parseOwner = obj => {
  const owner = (obj.shortBylineText && obj.shortBylineText.runs[0]) ||
    (obj.longBylineText && obj.longBylineText.runs[0]);
  const ownerUrl = owner.navigationEndpoint.browseEndpoint.canonicalBaseUrl ||
    owner.navigationEndpoint.commandMetadata.webCommandMetadata.url;
  const isOfficial = !!(obj.ownerBadges && JSON.stringify(obj.ownerBadges).includes('OFFICIAL'));
  const isVerified = !!(obj.ownerBadges && JSON.stringify(obj.ownerBadges).includes('VERIFIED'));
  const fallbackURL = owner.navigationEndpoint.commandMetadata.webCommandMetadata.url;

  return {
    name: owner.text,
    channelID: owner.navigationEndpoint.browseEndpoint.browseId,
    url: new URL(ownerUrl || fallbackURL, BASE_VIDEO_URL).toString(),
    ownerBadges: Array.isArray(obj.ownerBadges) ? obj.ownerBadges.map(a => a.metadataBadgeRenderer.tooltip) : [],
    verified: isOfficial || isVerified,
  };
};