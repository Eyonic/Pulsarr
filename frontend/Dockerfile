FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package.json .
RUN npm install

# Copy the rest of the code
COPY . .

# Expose port and run
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host"]