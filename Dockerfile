# stage1: copy package*.json and install the production set of dependencies
FROM node:12-alpine as stage1
WORKDIR /usr/src/app
RUN apk add --no-cache git python make g++
COPY package*.json ./
RUN npm clean-install --only=production

# stage2: install all dev dependencies and build the final .js, reuse node_modules from stage1
FROM node:12-alpine as stage2
WORKDIR /usr/src/app
RUN apk add --no-cache git python make g++
COPY package*.json ./
COPY --from=stage1 /usr/src/app/node_modules ./node_modules
RUN npm install
COPY tsconfig.json ./
COPY src ./src/
COPY hathor-wallet-lib-types ./hathor-wallet-lib-types/
RUN npm run tsc

# finally: use production node_modules (from stage1) and compiled .js (from stage2)
# lean and mean: this image should be about ~110MB, would be about ~470MB if using the whole stage2
FROM node:12-alpine
WORKDIR /usr/src/app
COPY --from=stage1 /usr/src/app/node_modules ./node_modules
COPY --from=stage2 /usr/src/app/dist/ ./
CMD [ "node", "index.js" ]
