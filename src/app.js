import express from 'express';
import { convertFromYoutubeToSpotify, getSpotifyPlaylistTracks } from "./spotify.js";
import { convertToYoutubeFromSpotify, getYoutubePlaylistTracks } from "./youtube.js";
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = 3000;

app.use(express.static('..'));

app.get('/convert', async (req, res) => {
    const playlistUrl = req.query.url;
    
    if (!playlistUrl) {
        return res.status(400).json({ error: 'Please provide a playlist URL' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    let clientConnected = true;	

    async function convertFromYoutube(playlistUrl){
		const youtubeTracks = await getYoutubePlaylistTracks(playlistUrl);
	
		for await (const result of convertFromYoutubeToSpotify(youtubeTracks)) {
			if (!clientConnected) break;
			res.write(`data: ${JSON.stringify(result)}\n\n`);
		}
    }

    async function convertFromSpotify(playlistUrl){
    	const spotifyTracks = await getSpotifyPlaylistTracks(playlistUrl);
	
		for await (const result of convertToYoutubeFromSpotify(spotifyTracks)) {
			if (!clientConnected) break;
			res.write(`data: ${JSON.stringify(result)}\n\n`);
		}
    }

    try {
     	res.on('close', () => {
		clientConnected = false;
	});

	if (playlistUrl.includes("youtube.com")) {
		await convertFromYoutube(playlistUrl);
	} else if (playlistUrl.includes("spotify.com")){
		await convertFromSpotify(playlistUrl);
	} else {
		alert("Endereço não suportado")
	}
    } catch (error) {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    } finally {
        res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
        res.end();
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});
