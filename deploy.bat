@echo off
chcp 65001 >nul
echo ============================================
echo   船讯网3D船舶追踪平台 - GitHub部署脚本
echo ============================================
echo.

cd /d "M:\Project\2026-07-30-船讯网3D船舶追踪"

echo [1/3] 添加GitHub远程仓库...
git remote add origin https://github.com/airushaonian7/shipxy-dashboard.git

echo [2/3] 推送代码到GitHub...
git push -u origin main

echo [3/3] 部署完成！
echo.
echo ============================================
echo   仓库地址: https://github.com/airushaonian7/shipxy-dashboard
echo   网页地址: https://airushaonian7.github.io/shipxy-dashboard/
echo ============================================
echo.
echo ⚠️ 启用 GitHub Pages 步骤:
echo 1. 打开 https://github.com/airushaonian7/shipxy-dashboard/settings/pages
echo 2. Source 选择 "Deploy from a branch"
echo 3. Branch 选择 "main" → 点击 Save
echo 4. 等待1-2分钟后访问网页地址
echo.
pause
