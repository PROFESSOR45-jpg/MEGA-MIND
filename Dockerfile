FROM node:18-bookworm-slim

# ffmpeg = audio conversion / video merging, python3 = used by some yt-dlp helpers
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl python3 \
 && rm -rf /var/lib/apt/lists/*

# yt-dlp standalone binary (latest release)
RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
      -o /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp

# Recent yt-dlp needs a JavaScript runtime for YouTube; Node is already here.
ENV YTDLP_JS_RUNTIME=node

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

# Refresh yt-dlp on every start (sites change often), then run the bot.
CMD ["sh", "-c", "yt-dlp -U || true; node index.js"]
