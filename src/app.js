import express from 'express';
import { convertFromYoutubeToSpotify, getSpotifyPlaylistTracks, createSpotifyPlaylist } from "./spotify.js";
import { convertToYoutubeFromSpotify, getYoutubePlaylistTracks } from "./youtube.js";
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = 3000;

app.use(express.static('src'));
app.use(express.json());

app.get('/', (req, res) => {
	res.sendFile('client/pages/index.html', { root: 'src' });
});

const generateRandomString = (length) => {
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	const values = crypto.getRandomValues(new Uint8Array(length));
	return values.reduce((acc, x) => acc + possible[x % possible.length], "");
  }

app.get('/auth', (req, res) => {

	const clientId = process.env.SPOTIFY_CLIENT_ID;
	const redirectUri = 'http://localhost:3000';

	const scope = 'user-read-private user-read-email';
	const authUrl = new URL("https://accounts.spotify.com/authorize")

	// generated in the previous step
	window.localStorage.setItem('code_verifier', codeVerifier);

	const params =  {
	response_type: 'code',
	client_id: clientId,
	scope,
	code_challenge_method: 'S256',
	code_challenge: codeChallenge,
	redirect_uri: redirectUri,
	}

	authUrl.search = new URLSearchParams(params).toString();
	window.location.href = authUrl.toString();
}); 

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

app.post("/createPlaylist", async (req,res) => {
	console.log(req.body);

	const playlistLink = await createSpotifyPlaylist(req.tracksList, req.body.userId, req.body.playlist)

	
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});
