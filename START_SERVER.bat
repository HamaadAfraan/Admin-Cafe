@echo off
title Strangers Gaming Cafe - System Bridge
color 0A
echo Starting Strangers Gaming Cafe Local Control Server...
echo Do not close this window while the cafe is open!
echo.
python -m pip install flask flask-cors --quiet
python bridge.py
pause