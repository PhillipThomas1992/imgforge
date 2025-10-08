# Build stage for Rust backend
FROM rust:1.90 as backend-builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy backend files
COPY backend/Cargo.toml backend/Cargo.lock ./
COPY backend/src ./src

# Build the backend
RUN cargo build --release

# Build stage for Next.js frontend
FROM node:20-alpine as frontend-builder

WORKDIR /build

# Copy package files
COPY frontend/package.json frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Build the Next.js app
RUN npm run build

# Final runtime stage
FROM ubuntu:22.04

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    unzip \
    xz-utils \
    qemu-user-static \
    binfmt-support \
    e2fsprogs \
    fdisk \
    parted \
    dosfstools \
    kpartx \
    lsblk \
    util-linux \
    coreutils \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create working directories
RUN mkdir -p /app/frontend /workdir /tmp/imgforge-uploads

WORKDIR /app

# Copy Rust backend binary
COPY --from=backend-builder /build/target/release/imgforge-backend /app/backend

# Copy Next.js frontend build
COPY --from=frontend-builder /build/.next/standalone ./frontend/
COPY --from=frontend-builder /build/.next/static ./frontend/.next/static
COPY --from=frontend-builder /build/public ./frontend/public

# Copy imgforge.sh script
COPY imgforge.sh /workdir/imgforge.sh
RUN chmod +x /workdir/imgforge.sh

# Set environment variables
ENV RUST_LOG=info
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Run the backend (which serves the frontend)
CMD ["/app/backend"]
