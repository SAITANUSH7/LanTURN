# ---- stage 1: compile the optional C++ core against this exact Node version ----
FROM node:22-slim AS native
RUN apt-get update && apt-get install -y --no-install-recommends g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY native ./native
RUN mkdir -p native/build && node native/build.mjs

# ---- stage 2: runtime ----
FROM node:22-slim
WORKDIR /app
# poppler renders scanned PDF pages so the vision model can read them
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
# If the C++ build failed or was skipped, the app silently uses the JS implementations.
COPY --from=native /build/native/build ./native/build
ENV NODE_ENV=production
# Attach a Railway Volume mounted at /data (Railway does not allow the VOLUME instruction)
ENV DB_FILE=/data/lanturn.db UPLOAD_DIR=/data/uploads
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--no-warnings", "server.js"]
