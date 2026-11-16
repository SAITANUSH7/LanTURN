FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
# Persistent volume for SQLite DB and resume uploads
ENV DB_FILE=/data/lanturn.db UPLOAD_DIR=/data/uploads
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "--no-warnings", "server.js"]
