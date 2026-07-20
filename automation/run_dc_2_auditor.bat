@echo off
setlocal enabledelayedexpansion

:: ============================================================
:: DATA CENTER AUTOMATION — RUN 2 of 2, "AUDITOR" (wake time: 07:28,
:: chained as the second action of the "claude code automation 2" Task
:: Scheduler entry, after the smart-archive morning script).
::
:: Re-verifies (never trusts) the Builder branch from Run 1, merges to
:: master ONLY if the Push-Authorization Checklist passes in full, then
:: always performs the standing daily audit pass. See
:: automation/DATA_CENTER_AUTOMATION_SPEC.md and
:: automation/instructions_auditor.txt for full logic. This is the one
:: run allowed to merge/push to master, and only under that checklist.
:: ============================================================

set "DC_DIR=C:\Users\97252\GITHUB\data-center"
set "AUDITOR_INSTRUCTIONS="C:\Users\97252\GITHUB\data-center\automation\instructions_auditor.txt""

for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set "DT=%%I"
set "STAMP=%DT:~0,4%-%DT:~4,2%-%DT:~6,2%_%DT:~8,2%%DT:~10,2%%DT:~12,2%"

set "LOG_DIR=%DC_DIR%\automation\automation_logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
set "LOG_FILE=%LOG_DIR%\dc_run_%STAMP%.log"

echo ============================================== >> "%LOG_FILE%"
echo DC AUDITOR RUN started: %date% %time% >> "%LOG_FILE%"
echo ============================================== >> "%LOG_FILE%"

cd /d "%DC_DIR%" || (echo data-center dir not found >> "%LOG_FILE%" & exit /b 1)
git fetch origin >> "%LOG_FILE%" 2>&1
git checkout master >> "%LOG_FILE%" 2>&1
git pull origin master >> "%LOG_FILE%" 2>&1

echo -------------------------------------------------- >> "%LOG_FILE%"
echo Auditor session started: %time% >> "%LOG_FILE%"
echo -------------------------------------------------- >> "%LOG_FILE%"

call claude --dangerously-skip-permissions ^
  --disallowedTools "Bash(rm:*)" "Bash(git push --force*)" "Bash(git reset --hard:*)" ^
  -p "You are in data-center, on master, up to date with origin. Read %AUDITOR_INSTRUCTIONS% in this repo and execute the Run 2 (Auditor) procedure defined there in full: STEP 1 (audit and merge-if-clean any pending Builder branch, per the Push-Authorization Checklist) and STEP 2 (the standing daily audit pass, always runs). Merging/pushing to master is only permitted exactly where STEP 1 of that file says it is." ^
  >> "%LOG_FILE%" 2>&1

echo DC AUDITOR RUN (claude session) finished: %time% >> "%LOG_FILE%"

git checkout master >> "%LOG_FILE%" 2>&1
git pull origin master >> "%LOG_FILE%" 2>&1

echo DC AUDITOR RUN finished: %date% %time% >> "%LOG_FILE%"

endlocal
