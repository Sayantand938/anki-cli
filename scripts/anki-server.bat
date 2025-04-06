@echo off
:: Set the working directory to the location of Anki
cd /d "C:\Users\sayantan\AppData\Local\Programs\Anki"

:: Set the environment variable for the sync server credentials
set SYNC_USER1=testuser:testpass

:: Start the Anki sync server
echo Starting Anki Sync Server...
anki.exe --syncserver

:: Keep the terminal open after the server stops
pause