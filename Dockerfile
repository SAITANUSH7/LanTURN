FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
# Data (SQLite + resumes) must live on a mounted volume, e.g. /data
ENV DB_FILE=/data/lanturn.db UPLOAD_DIR=/data/uploads
EXPOSE 3000
CMD ["node", "--no-warnings", "server.js"]
