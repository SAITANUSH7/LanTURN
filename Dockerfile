FROM node:22-slim
WORKDIR /app
# poppler renders scanned PDF pages so the vision model can read them
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
# Attach a Railway Volume mounted at /data (Railway does not allow the VOLUME instruction)
ENV DB_FILE=/data/lanturn.db UPLOAD_DIR=/data/uploads
EXPOSE 3000
CMD ["node", "--no-warnings", "server.js"]
