# This file is a template, and might need editing before it works on your project.
FROM node:24.5.0
 

# Set the working directory to /app
WORKDIR /app

# Copy the package.json and package-lock.json files to the container
COPY package*.json ./

# nodemon install
RUN npm install
RUN npm install -g nodemon
RUN npm install pm2 -g

# Copy the rest of the application code to the container
COPY . .

ENV NODE_OPTIONS="--max-old-space-size=3072"

#Run Application
# CMD [ "nodemon", "index" ]
# --max-old-space-size is explicit rather than left to V8's auto-detection -
# on this container (4GB RAM per the platform's Resource Size), V8 was
# capping its own heap ceiling around ~460MB regardless of what's actually
# available, causing a "JavaScript heap out of memory" crash-loop shortly
# after boot. 3072MB leaves headroom below the 4GB limit for PM2, the
# newrelic agent, and non-heap (buffers/native) memory.
# CMD ["pm2-runtime", "index.js", "--node-args=--max-old-space-size=3072"]
CMD ["pm2-runtime", "npm", "--", "start"]