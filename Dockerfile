# This file is a template, and might need editing before it works on your project.
FROM node:24.5.0

# Set the working directory to /app
WORKDIR /app

# Build step: install dependencies and compile TypeScript
COPY package*.json ./
ARG NPM_TOKEN
RUN echo "@ultimez-interview:registry=https://npm.pkg.github.com" > .npmrc && \
    echo "//npm.pkg.github.com/:_authToken=${NPM_TOKEN}" >> .npmrc && \
    npm install --production=false && \
    rm -f .npmrc

COPY . .
RUN npm run build

# Start the application directly with Node
CMD ["node", "dist/index.js"]
