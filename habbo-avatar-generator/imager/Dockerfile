FROM node:16-bullseye AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
  git \
  python3 \
  make \
  g++ \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git clone --depth 1 https://github.com/billsonnn/nitro-imager.git /src/nitro-imager
WORKDIR /src/nitro-imager

RUN npm install
RUN npm run build

FROM node:16-bullseye AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
  libcairo2 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libjpeg62-turbo \
  libgif7 \
  librsvg2-2 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /src/nitro-imager /app
ENV NODE_ENV=production
EXPOSE 3030
CMD ["node", "dist/index.js"]