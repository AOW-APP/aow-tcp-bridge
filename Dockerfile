# use the official Bun image
FROM oven/bun:1.1-alpine AS base
WORKDIR /usr/src/app

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS install
RUN mkdir -p /tmp/dev
COPY package.json bun.lockb* /tmp/dev/
RUN cd /tmp/dev && bun install --frozen-lockfile

# install with --production (exclude devDependencies)
RUN mkdir -p /tmp/prod
COPY package.json bun.lockb* /tmp/prod/
RUN cd /tmp/prod && bun install --frozen-lockfile --production

# copy production dependencies and source code into final image
FROM base AS release
COPY --from=install /tmp/prod/node_modules node_modules
COPY . .

# run the app
USER bun
EXPOSE 9001 3000
ENTRYPOINT [ "bun", "run", "start" ]
