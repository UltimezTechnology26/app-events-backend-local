# This file is a template, and might need editing before it works on your project.
FROM node:24.5.0

# Set the working directory to /app
WORKDIR /app

# Copy the package.json and package-lock.json files to the container
COPY package*.json ./

# nodemon install
RUN npm install
RUN npm install -g pm2
COPY . .
RUN npm run build
CMD ["pm2-runtime", "dist/index.js"]
