function checkSpotifyAccessToken() {
    fetch('/check-auth')
        .then(response => response.json())
        .then(data => {
            if (!data.authenticated) {
                window.location.href = '/authSpotify';
            }
        })
        .catch(() => {
            window.location.href = '/authSpotify';
        });
}

function startConversion() {
    const playlistUrl = document.getElementById('playlistUrl').value;
    const resultsDiv = document.getElementById('results');
    const loadingDiv = document.getElementById('loading');
    resultsDiv.innerHTML = '';

    let eventSource;
    
    loadingDiv.style.display = 'block';

    eventSource = new EventSource(`/convert?url=${encodeURIComponent(playlistUrl)}`);
    
    let convertingFrom = '';

    if (playlistUrl.includes("youtube")) {
        convertingFrom = 'Youtube';
    } else if (playlistUrl.includes("spotify")) {
        convertingFrom = 'Spotify';
    }

    eventSource.onmessage = function(event) {
        const data = JSON.parse(event.data);

        if (data.type === 'end') {
            eventSource.close();
            console.log('Finished conversion');
            loadingDiv.style.display = 'none';
            return;
        }

        addTrackToResults(data, convertingFrom);
    };

    eventSource.onerror = function() {
        eventSource.close();
    };
}

function addTrackToResults(data, convertingFrom) {
    const resultsDiv = document.getElementById('results');
    const trackDiv = document.createElement('div');
    trackDiv.className = 'track-item';

    const header = document.createElement('div');
    header.className = 'track-header';
    if (data.bestMatch) {
        const thumbnail = document.createElement('img');
        thumbnail.src = convertingFrom == "Spotify" ? data.bestMatch.thumbnail : data.bestMatch.album.images[1].url;
        thumbnail.className = 'thumbnail';
        header.appendChild(thumbnail);
    }

    const info = document.createElement('div');
    info.className = 'track-info';
    
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'dropdown-toggle';
    toggleBtn.textContent = 'Other matches';
    
    info.innerHTML = data.bestMatch ? `
        <h3>
            <a href="${convertingFrom == "Spotify" ? data.bestMatch.url : data.bestMatch.external_urls.spotify}" target="_blank" class="track-link">
                ${convertingFrom == "Spotify" ? data.bestMatch.title : data.bestMatch.name} ${convertingFrom == "Youtube" ? `- ${data.bestMatch.artists[0].name}` : ''}
            </a>
        </h3>
        <div>
            Original song on ${convertingFrom}: 
            <a href="${convertingFrom == "Spotify" ? data.track.external_urls.spotify : data.videoMetadata.url}" target="_blank" class="track-link">
                ${convertingFrom == "Spotify" ? data.track.name : data.videoMetadata.title} - ${convertingFrom == "Spotify" ? data.track.artists[0].name : data.videoMetadata.author.name}
            </a>
        </div>
        <div class="score-details">Score: ${data.matches[0][1].totalScore} [${Object.entries(data.matches[0][1].scoreDetails).map(([name, score]) => `${name}: ${score}`).join(', ')}]</div>
    ` : `<h3>
            No match found for
            <a href="${convertingFrom == "Spotify" ? data.track.external_urls.spotify : data.videoMetadata.url}" target="_blank" class="track-link">
                ${convertingFrom == "Spotify" ? data.track.name : data.videoMetadata.title} - ${convertingFrom == "Spotify" ? data.track.artists[0].name : data.videoMetadata.author.name}
            </a>
        </h3>`;
    
    header.appendChild(info);
    header.appendChild(toggleBtn);
    trackDiv.appendChild(header);

    if (data.matches.length > 1) {
        const dropdownContent = document.createElement('div');
        dropdownContent.className = 'dropdown-content';
        
        let allMatches = data.matches;
        
        data.matches.slice(1).forEach((match, index) => {
            const altMatch = document.createElement('div');
            altMatch.className = 'alternative-match';
            
            altMatch.innerHTML = `
                <img src="${convertingFrom == "Spotify" ? match[0].thumbnail : match[0].album.images[1].url}" class="thumbnail">
                <div>
                    <div>
                        <a href="${convertingFrom == "Spotify" ? match[0].url : match[0].external_urls.spotify}" target="_blank" class="youtube-link">
                            ${convertingFrom == "Spotify" ? match[0].title : match[0].name} ${convertingFrom == "Youtube" ? `- ${data.bestMatch.artists[0].name}` : ''}
                        </a>
                    </div>
                    <div class="score-details">Score: ${match[1].totalScore} [${Object.entries(match[1].scoreDetails).map(([name, score]) => `${name}: ${score}`).join(', ')}]</div>
                    <button class="use-this-btn">Use this</button>
                </div>
            `;
            
            dropdownContent.appendChild(altMatch);
            const useThisBtn = altMatch.querySelector('.use-this-btn');
            useThisBtn.onclick = (e) => {
                e.stopPropagation();
                
                const actualIndex = index + 1;
                const tempBestMatch = allMatches[0];
                allMatches[0] = allMatches[actualIndex];
                allMatches[actualIndex] = tempBestMatch;
                
                const bestMatch = allMatches[0];
                const bestMatchElement = trackDiv.querySelector('.track-info h3 a');
                bestMatchElement.href = convertingFrom == "Spotify" ? bestMatch[0].url : bestMatch[0].external_urls.spotify;
                bestMatchElement.textContent = `${convertingFrom == "Spotify" ? bestMatch[0].title : bestMatch[0].name} ${convertingFrom == "Youtube" ? `- ${data.bestMatch.artists[0].name}` : ''}`;

                const scoreDetailsElement = trackDiv.querySelector('.track-info .score-details');
                scoreDetailsElement.innerHTML = `Score: ${bestMatch[1].totalScore} [${Object.entries(bestMatch[1].scoreDetails).map(([name, score]) => `${name}: ${score}`).join(', ')}]`;

                const thumbnailElement = trackDiv.querySelector('.track-header .thumbnail');
                thumbnailElement.src = convertingFrom == "Spotify" ? bestMatch[0].thumbnail : bestMatch[0].album.images[1].url;

                const thisMatchElement = altMatch.querySelector('a');
                thisMatchElement.href = convertingFrom == "Spotify" ? allMatches[actualIndex][0].url : allMatches[actualIndex][0].external_urls.spotify;
                thisMatchElement.textContent = convertingFrom == "Spotify" ? allMatches[actualIndex][0].title : allMatches[actualIndex][0].name;

                const thisScoreDetailsElement = altMatch.querySelector('.score-details');
                thisScoreDetailsElement.innerHTML = `Score: ${allMatches[actualIndex][1].totalScore} [${Object.entries(allMatches[actualIndex][1].scoreDetails).map(([name, score]) => `${name}: ${score}`).join(', ')}]`;

                const thisThumbnailElement = altMatch.querySelector('.thumbnail');
                thisThumbnailElement.src = convertingFrom == "Spotify" ? allMatches[actualIndex][0].thumbnail : allMatches[actualIndex][0].album.images[1].url;

            };
        });

        toggleBtn.onclick = (e) => {
            e.stopPropagation();
            dropdownContent.classList.toggle('show');
        };
        
        trackDiv.appendChild(dropdownContent);
    }

    resultsDiv.appendChild(trackDiv);
}

// Fechar dropdowns quando clicar fora
document.addEventListener('click', (event) => {
    if (!event.target.matches('.dropdown-toggle')) {
        document.querySelectorAll('.dropdown-content').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
    }
});

window.onload = function(e){ 
    checkSpotifyAccessToken()
}