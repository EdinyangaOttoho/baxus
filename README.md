# AI Agent API service for Bob

This repository contains the source code for the BAXUS AI agent, Bob, meant to analyze user selections and proffer whisky recommendations for them based on relevant data.

## Installation/Usage

Install the necessary modules by running

```bash
npm install
```
Once done, you can start the backend Node/Express service by running the entry file with

```bash
node app.js
```

You can then visit the GET endpoint [http://localhost:{{PORT}}/api/recommendations/user/{{username}}](http://localhost:3000/api/recommendations/user/carriebaxus) to see the list of recommendations for the given user with {{username}}.


Voila!