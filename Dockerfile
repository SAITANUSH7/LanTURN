# Stage 1: Build React 18 SPA Frontend
FROM node:22-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Production Express Runtime
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
# Copy compiled frontend assets from builder stage
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
ENV NODE_ENV=production
# Persistent volume for SQLite DB and resume uploads
ENV DB_FILE=/data/lanturn.db UPLOAD_DIR=/data/uploads
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "--no-warnings", "server.js"]
