@echo off
cd /d F:\Git\teams-meeting-fetcher
call .venv\Scripts\activate.bat
python scripts\batch-create-meetings.py > meeting-creation.log 2>&1
type meeting-creation.log
