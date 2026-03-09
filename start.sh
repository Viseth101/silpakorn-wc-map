#!/bin/bash
# simple launcher for repository root
# used by Railway/Railpack when project root is the repo

cd Backend || exit 1
npm install --omit=dev
npm run start
