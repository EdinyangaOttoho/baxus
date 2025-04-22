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

Make sure to wait for the initial AI mapping/serialization (or training) of the model against the whisky images which could take around 3-5 minutes at max to complete. You'll see logs like:

```bash
#Compiled 100/500
#Compiled 200/500
```

Wait for the final message 'Server running on port {{PORT}}' before you can use the recommendation endpoint.

You can then visit the GET endpoint [http://localhost:{{PORT}}/api/recommendations/user/{{username}}](http://localhost:3000/api/recommendations/user/carriebaxus) to see the list of recommendations for the given user with {{username}}.

Note that the first-time loads for the user profiles may take up to 2-5 minutes to generate recommendations. Subsequent loads will be way faster ~ sub 4 secs.

> Note that time consumed is based on your hardware capabilities.


Voila!