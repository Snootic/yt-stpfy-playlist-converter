import { SpotifyApi } from "@spotify/web-api-ts-sdk";
import { scoreTrack, parseVideoTitle } from "./utils.js";
import { getVideoMetadata } from "./youtube.js";

const api = SpotifyApi.withUserAuthorization(
    process.env.SPOTIFY_CLIENT_ID,
    "https://localhost:3000/callback",
    ["playlist-read-private",
    "playlist-read-collaborative",
    "playlist-modify-private",
    "playlist-modify-public"
    ]
);
// const userAccessToken = "";

// const api = SpotifyApi.withAccessToken(
//     process.env.SPOTIFY_CLIENT_ID,
//     userAccessToken
// );

const playlistCache = new Map()
const tracksCache = new Map()

function playlistIdParser(playlistUrl) {
    const playlistId = playlistUrl.split("/playlist/")[1].split("?")[0];
    return playlistId;
}

async function checkMatches(spotifyTracks, videoMetadata) {
    const matches = new Map();

    await Promise.all(spotifyTracks.map(async (track) => {
        const scoreDetails = await scoreTrack(track, videoMetadata);

        if (scoreDetails === null) {
            return;
        }

        const totalScore = Object.values(scoreDetails).reduce((sum, value) => sum + value, 0);

        matches.set(track, { totalScore, scoreDetails });
    }));

    const sortedMatches = [...matches.entries()].sort((a, b) => {
        return b[1].totalScore - a[1].totalScore;
    });

    return sortedMatches;
}

async function getPlaylistTracks(playlistId) {
    if (playlistId.includes("/playlist/")) {
        playlistId = playlistIdParser(playlistId);
    }

    if (tracksCache.has(playlistId)) {
        console.log(`Cache hit for playlist ${playlistId}`);
        return tracksCache.get(playlistId);
    }

    console.log( await api.getAccessToken() );

    const playlist = await api.playlists.getPlaylist(playlistId)
    .catch(err => {
        console.log(err);
    });
    console.log(`Got playlist ${playlist.name}`);

    playlistCache.set(playlistId, playlist);

    let totalTracks = playlist.tracks.total;
    
    console.log(`${totalTracks} in this playlist`);    

    let tracks = [];

    while (tracks.length < totalTracks) {

        const result = await api.playlists.getPlaylistItems(playlistId, null, null, 100, tracks.length);
        
        tracks = tracks.concat(result.items.map((item) => item.track));
    }

    tracksCache.set(playlistId, tracks);

    return tracks
}

async function searchTrackFromYoutube(videoMetadata) {
    const query = parseVideoTitle(videoMetadata.title);
    // console.log(query)
    const search = await api.search(query, 'track', null, 20);
    
    const tracks = search.tracks.items;

    return tracks;
}

async function* convertFromYoutube(youtubePlaylist) {
  for (const video of youtubePlaylist) {
    const videoMetadata = await getVideoMetadata(video);
    const tracks = await searchTrackFromYoutube(videoMetadata);
    const matches = await checkMatches(tracks, videoMetadata);

    if (matches.length > 0) {
      const bestMatch = matches[0][0];

    //   console.log(`Match found for ${videoMetadata.author.name} - ${videoMetadata.title}: ${bestMatch.name} - ${bestMatch.external_urls.spotify} with score ${matches[0][1].totalScore}`);
    //   console.log(`Other matches: ${matches.slice(1).map((match) => `${match[0].name} - ${match[0].external_urls.spotify} with score ${match[1].totalScore}\n`)}`);
      
      yield { videoMetadata, bestMatch, matches };
    } else {
    //   console.log(`No match found for ${videoMetadata.author.name} - ${videoMetadata.title}`);
      
      yield { videoMetadata, bestMatch: null, matches: [] };
    }
  }
}

async function createPlaylist(tracksList, userId, createPlaylistRequest) {
	const playlist = await api.playlists.createPlaylist(userId, createPlaylistRequest);
	
	console.log(playlist)
	
}

export const createSpotifyPlaylist = createPlaylist;
export const getSpotifyPlaylistTracks = getPlaylistTracks;
export const convertFromYoutubeToSpotify = convertFromYoutube;

