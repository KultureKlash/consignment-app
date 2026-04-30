# ---- Build stage: install all deps + build ----
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json* ./

# Install ALL deps (including dev) for the build step.
# react-router build needs vite + @tailwindcss/vite which are dev deps.
RUN npm ci

COPY . .

RUN npm run build

# ---- Runtime stage: prod-only deps + built artifacts ----
FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

# Install only prod deps — slimmer runtime image
RUN npm ci --omit=dev && npm cache clean --force

# Copy built output + Prisma client + schema from the builder stage
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma

EXPOSE 3000

# docker-start = prisma generate && prisma migrate deploy && start
CMD ["npm", "run", "docker-start"]
