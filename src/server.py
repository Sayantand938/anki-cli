from flask import Flask, send_from_directory, abort
import os
import urllib.parse
from waitress import serve # <--- Production server import

app = Flask(__name__)

# The root directory where all your video files are stored.
# Using an absolute path is robust.
VIDEO_DIR = r"D:\Media\Recordings"

# --- CONFIGURATION ---
DEFAULT_PLAYBACK_RATE = 1.5
# ---------------------

# This route serves the actual video data.
@app.route("/video/<path:filename>")
def get_video(filename):
    try:
        # Flask's send_from_directory handles Range requests needed for video seeking
        return send_from_directory(VIDEO_DIR, filename, as_attachment=False)
    except FileNotFoundError:
        abort(404)

# This is the route you will link to from Anki.
@app.route("/play/<path:filename>")
def play_video_in_player(filename):
    
    video_url = f"/video/{urllib.parse.quote(filename)}"

    # Note: Using os.path.basename() on the filename for better display consistency
    display_filename = os.path.basename(filename) 

    return f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Playing: {display_filename}</title>
        <style>
            /* Basic CSS to make the video fill the entire page */
            html, body {{
                margin: 0;
                padding: 0;
                height: 100%;
                width: 100%;
                background-color: #000;
                display: flex;
                justify-content: center;
                align-items: center;
                overflow: hidden;
            }}
            #videoPlayer {{
                width: 100%;
                height: 100%;
                object-fit: contain;
            }}
        </style>
    </head>
    <body>
        <video id="videoPlayer" controls> <!-- Removed the HTML autoplay attribute -->
            <source src="{video_url}" type="video/mp4">
            Your browser does not support the video tag or the video could not be found.
        </video>
        
        <script>
            // 1. Get the video element
            const video = document.getElementById('videoPlayer');
            
            // 2. Set the default playback rate
            video.playbackRate = {DEFAULT_PLAYBACK_RATE}; 
            
            // 3. MOST RELIABLE AUTOPLAY ATTEMPT
            // Call .play() on load and catch the error if the browser blocks it.
            video.play().catch(error => {{
                // If autoplay fails (e.g., policy block), often the browser requires 
                // the video to be muted for it to succeed.
                video.muted = true;
                video.play();
                
                // If you want a message when it's blocked, uncomment the line below:
                // console.log("Autoplay blocked. Muted and trying again. Error:", error);
            }});

            // 4. HOTKEY LOGIC
            document.addEventListener('keydown', (event) => {{
                // Convert key to lowercase for case-insensitive check
                const key = event.key.toLowerCase(); 

                switch(key) {{
                    case ' ': // Spacebar for Play/Pause
                        event.preventDefault(); // Stop spacebar from scrolling the page
                        if (video.paused) {{
                            video.play();
                        }} else {{
                            video.pause();
                        }}
                        break;
                    case 'm': // Mute/Unmute
                        video.muted = !video.muted;
                        break;
                    case 'f': // Fullscreen
                        if (document.fullscreenElement) {{
                            // Exit fullscreen if already in it
                            document.exitFullscreen();
                        }} else {{
                            // Request fullscreen on the video element
                            video.requestFullscreen().catch(err => {{
                                // Handle potential errors (e.g., permissions)
                                console.log(`Fullscreen error: ${{err.message}}`);
                            }});
                        }}
                        break;
                }}
            }});
        </script>
        
    </body>
    </html>
    """

if __name__ == "__main__":
    print("Starting Waitress server on http://127.0.0.1:8000")
    # Using waitress.serve() for production-grade, faster file serving
    serve(app, host='127.0.0.1', port=8000)




