# This file is a template, and might need editing before it works on your project.
FROM node:24.5.0

# Set the working directory to /app
WORKDIR /app

# Copy the package.json and package-lock.json files to the container
COPY package*.json ./

# nodemon install
ARG NPM_TOKEN
RUN echo "@ultimez-interview:registry=https://npm.pkg.github.com" > .npmrc && \
    echo "//npm.pkg.github.com/:_authToken=${NPM_TOKEN}" >> .npmrc && \
    npm install -g nodemon && \
    npm install pm2 -g && \
    rm -f .npmrc
COPY . .
RUN npm run build
CMD ["pm2-runtime", "dist/index.js"]
