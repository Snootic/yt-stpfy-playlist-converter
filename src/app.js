import express from 'express';
import { convertFromYoutubeToSpotify, getSpotifyPlaylistTracks, createSpotifyPlaylist } from "./spotify.js";
import { convertToYoutubeFromSpotify, getYoutubePlaylistTracks } from "./youtube.js";
import dotenv from 'dotenv';
import crypto from 'crypto';
import querystring from 'querystring';
import axios from 'axios';
import cookieParser from 'cookie-parser';

dotenv.config();

const app = express();

const port = 3000;

app.use(express.static('src'));
app.use(express.json());
app.use(cookieParser());

app.get('/', (req, res) => {
	res.sendFile('client/pages/index.html', { root: 'src' });
});

const generateRandomString = (length) => {
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	const values = crypto.getRandomValues(new Uint8Array(length));
	return values.reduce((acc, x) => acc + possible[x % possible.length], "");
  }

app.get('/authSpotify', (req, res) => {

	const clientId = process.env.SPOTIFY_CLIENT_ID;
	const redirectUri = process.env.REDIRECT_URL;

	var state = generateRandomString(16);
	const scope = 'user-read-private user-read-email';

    res.redirect('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: clientId,
            scope: scope,
            redirect_uri: redirectUri,
            state: state
        })
    );
});

app.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    const state = req.query.state || null;

    if (state === null) {
        return res.redirect('/#' + querystring.stringify({ error: 'state_mismatch' }));
    }

    try {
        const tokenResponse = await axios.post(
            'https://accounts.spotify.com/api/token',
            querystring.stringify({
                code: code,
                redirect_uri: process.env.REDIRECT_URL,
                grant_type: 'authorization_code'
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(
                        process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
                    ).toString('base64')
                }
            }
        );

        const { access_token, refresh_token } = tokenResponse.data;

        res.cookie('access_token', access_token, {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
        });
        res.cookie('refresh_token', refresh_token, {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
        });
        res.redirect('/');
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.redirect('/?error=token_error');
    }
});

app.get('/check-auth', (req, res) => {
    const accessToken = req.cookies['access_token'];
    if (accessToken) {
        res.json({ authenticated: true });
    } else {
        res.json({ authenticated: false });
    }
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
