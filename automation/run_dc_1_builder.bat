@echo off
setlocal enabledelayedexpansion

:: ============================================================
:: DATA CENTER AUTOMATION — RUN 1 of 2, "BUILDER" (wake time: 02:30,
:: chained as the second action of the "claude code automation" Task
:: Scheduler entry, after the smart-archive night script).
::
:: Selects ONE eligible item from automation/TODO_LIST.md, does the work
:: on a fresh branch off master, validates, commits in small increments,
:: pushes the branch to origin. NEVER merges or pushes to master — that
:: is Run 2's ("Auditor") job. See automation/DATA_CENTER_AUTOMATION_SPEC.md
:: and automation/instructions_builder.txt for full logic.
:: ============================================================

set "DC_DIR=C:\Users\97252\GITHUB\data-center"
set "BUILDER_INSTRUCTIONS="C:\Users\97252\GITHUB\data-center\automation\instructions_builder.txt""

for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set "DT=%%I"
set "STAMP=%DT:~0,4%-%DT:~4,2%-%DT:~6,2%_%DT:~8,2%%DT:~10,2%%DT:~12,2%"

set "LOG_DIR=%DC_DIR%\automation\automation_logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
set "LOG_FILE=%LOG_DIR%\dc_run_%STAMP%.log"

echo ============================================== >> "%LOG_FILE%"
echo DC BUILDER RUN started: %date% %time% >> "%LOG_FILE%"
echo ============================================== >> "%LOG_FILE%"

cd /d "%DC_DIR%" || (echo data-center dir not found >> "%LOG_FILE%" & exit /b 1)
git fetch origin >> "%LOG_FILE%" 2>&1
git checkout master >> "%LOG_FILE%" 2>&1
git pull origin master >> "%LOG_FILE%" 2>&1

echo -------------------------------------------------- >> "%LOG_FILE%"
echo Selecting item and branching: %time% >> "%LOG_FILE%"
echo -------------------------------------------------- >> "%LOG_FILE%"

git checkout -b dc-auto-%STAMP% >> "%LOG_FILE%" 2>&1

call claude --dangerously-skip-permissions ^
  --disallowedTools "Bash(rm:*)" "Bash(git push origin master*)" "Bash(git push --force*)" "Bash(git reset --hard:*)" "Bash(git merge*)" ^
  -p "You are in data-center, on a fresh branch named dc-auto-%STAMP% cut from master. Read %BUILDER_INSTRUCTIONS% in this repo and execute the Run 1 (Builder) procedure defined there in full, including selecting the item, doing the work, validating, committing in small increments, updating the state file and run log, and pushing this exact branch (dc-auto-%STAMP%) to origin. Never merge or push to master." ^
  >> "%LOG_FILE%" 2>&1

echo DC BUILDER RUN (claude session) finished: %time% >> "%LOG_FILE%"

git checkout master >> "%LOG_FILE%" 2>&1
git pull origin master >> "%LOG_FILE%" 2>&1

echo DC BUILDER RUN finished: %date% %time% >> "%LOG_FILE%"

endlocal
