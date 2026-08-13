@echo off
setlocal
chcp 65001 >nul
title DCInside Gallery Maker

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo [오류] Node.js가 설치되어 있지 않습니다.
    echo Node.js 20.19 이상 또는 22.12 이상을 설치한 뒤 다시 실행해 주세요.
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [오류] npm을 찾을 수 없습니다. Node.js를 다시 설치해 주세요.
    echo.
    pause
    exit /b 1
)

node -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit((major===20&&minor>=19)||(major===22&&minor>=12)||major>22?0:1)"
if errorlevel 1 (
    echo [오류] 현재 Node.js 버전은 지원되지 않습니다: 
    node --version
    echo Node.js 20.19 이상 또는 22.12 이상이 필요합니다.
    echo.
    pause
    exit /b 1
)

if not exist "package-lock.json" (
    echo [오류] package-lock.json을 찾을 수 없습니다.
    echo 이 파일을 프로젝트 루트에서 실행했는지 확인해 주세요.
    echo.
    pause
    exit /b 1
)

set "NEED_INSTALL=0"
if not exist "node_modules\.package-lock.json" set "NEED_INSTALL=1"

if "%NEED_INSTALL%"=="0" (
    call npm ls --depth=0 --silent >nul 2>&1
    if errorlevel 1 set "NEED_INSTALL=1"
)

if "%NEED_INSTALL%"=="1" (
    echo [준비] 필요한 패키지를 설치합니다. 첫 실행에는 잠시 시간이 걸릴 수 있습니다.
    call npm ci
    if errorlevel 1 (
        echo.
        echo [오류] 패키지 설치에 실패했습니다. 위 메시지를 확인해 주세요.
        echo.
        pause
        exit /b 1
    )
)

if /i "%~1"=="--check" (
    echo [확인 완료] Node.js와 프로젝트 패키지가 준비되어 있습니다.
    exit /b 0
)

set "NEED_BUILD=0"
if not exist "dist\index.html" set "NEED_BUILD=1"
if not exist "dist-server\index.js" set "NEED_BUILD=1"

if "%NEED_BUILD%"=="1" (
    echo [준비] 실행 파일을 처음 빌드합니다. 잠시 기다려 주세요.
    call npm run build
    if errorlevel 1 (
        echo.
        echo [오류] 앱 빌드에 실패했습니다.
        echo.
        pause
        exit /b 1
    )
)

set "PORT="
for /f "delims=" %%P in ('powershell.exe -NoProfile -Command "$p=5173; while (Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue) { $p++ }; $p"') do if not defined PORT set "PORT=%%P"
if not defined PORT set "PORT=5173"
set "APP_URL=http://127.0.0.1:%PORT%"

echo.
echo [실행] 앱 서버를 시작합니다.
echo 주소: %APP_URL%
echo 브라우저가 자동으로 열리지 않으면 위 주소를 직접 열어 주세요.
echo 이 창이 열린 채 대기하는 것은 정상입니다.
echo 앱을 종료하려면 이 창에서 Ctrl+C를 누르세요.
echo.

if /i not "%~1"=="--no-browser" (
    start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "$url='%APP_URL%'; for($i=0; $i -lt 60; $i++){ try { Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1 ^| Out-Null; Start-Process $url; break } catch { Start-Sleep -Milliseconds 500 } }"
)

if /i "%~1"=="--dev" (
    call npm run dev
) else (
    call npm start
)
set "RUN_EXIT=%ERRORLEVEL%"

if not "%RUN_EXIT%"=="0" (
    echo.
    echo [오류] 서버가 종료되었습니다. 위 메시지를 확인해 주세요.
    echo.
    pause
    exit /b %RUN_EXIT%
)

exit /b 0
