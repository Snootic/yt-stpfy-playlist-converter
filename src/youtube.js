import { google } from 'googleapis';
import http from 'http';
import opn from 'open';
import destroyer from 'server-destroy';
import url from 'url';
import yts from 'yt-search';
import { parseISO8601Duration, scoreTrack } from './utils.js';
import { fs } from 'fs';

const youtube = google.youtube("v3");

function readClientSecretJson() {
  const content = fs.readFileSync('client_secret.json');
  return JSON.parse(content);
}

async function authenticate() {
  const clientSecret = readClientSecretJson();

  const oauth2Client = new google.auth.OAuth2({
    clientId:   clientSecret.client_id,
    clientSecret: clientSecret.client_secret,
    redirectUri: clientSecret.redirect_uris[0]
  });

  google.options({auth: oauth2Client});

  const scopes = [
      "https://www.googleapis.com/auth/youtube",
      "https://www.googleapis.com/auth/youtube.force-ssl"
  ];

  return new Promise((resolve, reject) => {
    // grab the url that will be used for authorization
    const authorizeUrl = oauth2Client.generateAuthUrl({
      access_type: 'online',
      scope: scopes.join(' '),
    });
    const server = http
      .createServer(async (req, res) => {
        try {
          if (req.url.indexOf('/oauth2callback') > -1) {
            const qs = new url.URL(req.url, 'http://localhost:3000')
              .searchParams;
            res.end('Authentication successful! Please return to the console.');
            server.destroy();
            const {tokens} = await oauth2Client.getToken(qs.get('code'));
            oauth2Client.credentials = tokens;
            resolve(oauth2Client);
          }
        } catch (e) {
          reject(e);
        }
      })
      .listen(3000, () => {
        // open the browser to the authorize url to start the workflow
        opn(authorizeUrl, {wait: false}).then(cp => cp.unref());
      });
    destroyer(server);
  });
}

async function searchWithGoogleApi(spotifyTrack) {
    const response = await youtube.search.list({
        part: "snippet",
        q: `${spotifyTrack.name} ${spotifyTrack.artists[0].name} ${spotifyTrack.album.name}`,
        maxResults: 3,
        type: "video"
      });
    return response.data.items;
}

async function matchesFromGoogleApi(track, videosIds) {
    const response = await youtube.videos.list({
        part: "contentDetails",
        id: videosIds
    });

    let videos = response.data.items;
    
    let matchesIds = [];

    for (const video of videos) {
        const duration = parseISO8601Duration(video.contentDetails.duration);
        if (!(Math.abs(video.seconds - track.duration_ms / 1000) <= 5)) {
            videos.splice(videos.indexOf(video), 1);
        }
    }

    videos.map((video) => {
        matchesIds.push(video.id);
    });

    return matchesIds;
}

async function convertWithGoogleApi(spotifyPlaylist) {
    let youtubePlaylist = new Map();
    for (const track of spotifyPlaylist) {
      let tracksIds = []
      const youtubeTracks = await searchWithGoogleApi(track);
      youtubeTracks.map((video) => {
          tracksIds.push(video.id.videoId);
      });
      const matches = await checkMatches(track, tracksIds);

      youtubeTracks.map((video) => {
        if (matches.includes(video.id.videoId)) {
            youtubePlaylist.set(track, video);
            console.log(track.name, video.snippet.title, video.id.videoId)
        }
      });
      
    }
    return youtubePlaylist;
}

async function getVideoMetadata(video) {
  let videoMetadata = null;
  let attempts = 0;
  let success = false;
  while (attempts < 5 && !success) {
    console.log(`attempt ${attempts} for ${video.videoId}`);
    try {
      videoMetadata = await yts({ videoId: video.videoId });
      success = true;
    } catch (error) {
      console.log(error);
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
    }
  }
  return videoMetadata;
}

async function checkMatches(track, videos) {
  const matches = new Map();

  await Promise.all(videos.map(async (video, index) => {    
    let videoMetadata = await getVideoMetadata(video);

    const scoreDetails = await scoreTrack(track, videoMetadata);

    if (scoreDetails === null) {
      return;
    }

    const totalScore = Object.values(scoreDetails).reduce((sum, value) => sum + value, 0);

    matches.set(videoMetadata, { totalScore, scoreDetails });
  }));

  let allViews = new Map();
  matches.forEach((value, key) => {
    allViews.set(key, key.views);
  });

  const sortedViews = [...allViews.entries()].sort((a, b) => b[1] - a[1]);
  if (sortedViews.length > 0) {
    matches.get(sortedViews[0][0]).scoreDetails.bonus += 2;
    matches.get(sortedViews[0][0]).totalScore += 2;
  }

  const sortedMatches = [...matches.entries()].sort((a, b) => {
    if (b[1].totalScore === a[1].totalScore) {
      return b[0].views - a[0].views;
    }
    return b[1].totalScore - a[1].totalScore;
  });

  return sortedMatches;
}

async function searchTrackFromSpotify(track) {
  let query = `${track.name} ${track.artists[0].name}`;
  console.log(`Searching for ${query}`);
  let result = null;

  let attempts = 0;
  let success = false;
  while (attempts < 5 && !success) {
    console.log(`attempt ${attempts} for ${query}`);
    try {
      result = await yts(query);
      success = true;
    } catch (error) {
      console.log(error);
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000 * attempts));      
    }
  }

  const videos = result.videos.slice(0,10);

  return videos;
}

// async function convertFromSpotify(spotifyTracks) {
//   let allTracks = new Map();
//   let allMatches = new Map();
  
//   for (const track of spotifyTracks) {
//     const videos = await searchTrackFromSpotify(track);

//     const matches = await checkMatches(track, videos);

//     if (matches.length > 0) {
//       const bestMatch = matches[0][0];

//       allMatches.set(track.id, matches);
//       allTracks.set(track.id, bestMatch);

//       console.log(`Match found for ${track.artists[0].name} - ${track.name}: ${bestMatch.title} - ${bestMatch.url} with score ${matches[0][1]}`);
//       console.log(`Other matches: ${matches.slice(1).map((match) => `${match[0].title} - ${match[0].url} with score ${match[1]}\n`)}`);
//     } else {
//       console.log(`No match found for ${track.artists[0].name} - ${track.name}`);
//     }

//   }

//   return allTracks, allMatches;
// }

async function* convertFromSpotify(spotifyTracks) {
  for (const track of spotifyTracks) {
    const videos = await searchTrackFromSpotify(track);
    const matches = await checkMatches(track, videos);

    if (matches.length > 0) {
      const bestMatch = matches[0][0];
      console.log(`Match found for ${track.artists[0].name} - ${track.name}: ${bestMatch.title} - ${bestMatch.url} with score ${matches[0][1].totalScore}`);
      console.log(`Other matches: ${matches.slice(1).map((match) => `${match[0].title} - ${match[0].url} with score ${match[1].totalScore}\n`)}`);
      yield { track, bestMatch, matches };
    } else {
      console.log(`No match found for ${track.artists[0].name} - ${track.name}`);
      yield { track, bestMatch: null, matches: [] };
    }
  }
}


function playlistIdParser(playlistUrl) {
    const playlistId = playlistUrl.split("list=")[1];
    return playlistId;
}

async function getPlaylistTracks(playlistUrl){	
  const playlistId = playlistIdParser(playlistUrl)
	
	console.log(`Getting Youtube Playlist ${playlistId}`); 
	
	let playlist = await yts( {listId: playlistId} );
	
	let videos = []

  console.log(playlist.videos.length)
  console.log(playlist.size) // TODO: find a way to get all videos in the playlist if it has more than 100
  // the current API Client only supports 100 at a time because of ytInitialData only returning it
	
	playlist.videos.map((video) => videos.push(video));

  console.log(`Found ${videos.length} for playlist ${playlist.listId}`)
	
	//console.log(videos);
	
	return videos
}

async function createPlaylist(){
  
}

export const convertToYoutubeWithGoogle = convertWithGoogleApi;
export const convertToYoutubeFromSpotify = convertFromSpotify;
export const getYoutubePlaylistTracks = getPlaylistTracks;
export const createYoutubePlaylist = createPlaylist;
export { getVideoMetadata };
