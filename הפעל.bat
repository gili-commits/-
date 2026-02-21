@echo off
chcp 65001 >nul
echo.
echo =====================================
echo   מערכת ניהול שכירויות
echo =====================================
echo.

:: Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [!] Node.js לא מותקן!
    echo.
    echo כדי להפעיל את האפליקציה, יש להוריד ולהתקין Node.js:
    echo.
    echo   1. לך לאתר: https://nodejs.org
    echo   2. הורד את גרסת LTS
    echo   3. הפעל את ההתקנה
    echo   4. הפעל מחדש את הקובץ הזה
    echo.
    start https://nodejs.org
    pause
    exit /b 1
)

echo [v] Node.js נמצא:
node --version

:: Install dependencies if needed
if not exist node_modules (
    echo.
    echo [*] מתקין תלויות...
    npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [!] שגיאה בהתקנת תלויות
        pause
        exit /b 1
    )
    echo [v] תלויות הותקנו בהצלחה
)

echo.
echo [*] מפעיל שרת...
echo.
echo ===================================
echo   האפליקציה פועלת בכתובת:
echo   http://localhost:3000
echo ===================================
echo.
echo לחץ Ctrl+C כדי לעצור
echo.

:: Start server (foreground - closing this window stops the server)
:: Browser opens automatically via server.js
node server.js
pause
