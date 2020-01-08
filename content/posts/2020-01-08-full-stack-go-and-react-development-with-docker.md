---
template: post
title: Full Stack Go and React Development with Docker
slug: fullstack-go-react-development-with-docker
draft: true
date: 2020-01-08T12:54:37.547Z
description: Build a fullstack go and react developer environment with docker.
category: development
tags:
  - Delve Docker Golang Makefile Postgres Traefik VSCode
---
# Introduction

I expect you to be familiar with go and react. I won't teach you how to make a react app or a go api, rather we will focus our attention on building docker tooling around an existing full stack sample project.

At the end of this tutorial you will create the ultimate Go and React development environment with Docker. 

# Contents

* Setting Up VSCode
* Building Images
* Running Containers
* Live Reloading A Go API
* Delve Debugging A Go API
* Self-Signed Certificates With Traefik
* Running Tests

## Requirements

* [VSCode](https://code.visualstudio.com/)
* [Docker](https://www.docker.com/products/docker-desktop)

# Setting up VSCode

Download VSCode if you haven't already (its free). Then install the following extensions:

1. [The Go Extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode.Go) 
   Adds rich language support for the Go language.
2. [The Docker Extension](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-docker) \
   Adds syntax highlighting, commands, hover tips, and linting for docker related files.

Clone [the project repo](https://github.com/ivorscott/go-delve-reload) and checkout out the `starter` branch if you haven't already. 

```
git clone https://github.com/ivorscott/go-delve-reload
cd go-delve-reload
git checkout starter
```

Create a hidden folder named `.vscode` and then a file named `launch.json` under it.

```
mkdir .vscode
touch .vscode/launch.json
```

Add the following contents to `launch.json`.

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Launch remote",
      "type": "go",
      "request": "attach",
      "mode": "remote",
      "cwd": "${workspaceFolder}/api",
      "remotePath": "/api",
      "port": 2345,
      "showLog": true,
      "trace": "verbose"
    }
  ]
}
```

This above config will allow VSCode to remotely attach to the delve debugger inside the api container. 

# Building Images

### Creating the Go API Dockerfile

Make a new `Dockerfile` for the api folder and open it in your editor. Add the following contents:

```
# 1. FROM sets the baseImage to use for subsequent instructions.
# Extend the official golang image as the base stage
FROM golang:1.13.5 as base

# 2. WORKDIR sets the working directory for any subsequent COPY, CMD, or RUN instructions
WORKDIR /api

# 3. COPY copy files or folders from source to the destination path in the image's filesystem# Copy the api code into /api in the image filesystemCOPY . . 

# 4. RUN executes commands on top of the current image as a new layer and commit the results.# Install go module dependencies to the image filesystemRUN go mod download

# 5. Extend the base stage and create a new stage called dev
FROM base as dev

# 6. ENV sets an environment variable
# Create GOPATH and PATH Environment variables
ENV GOPATH /go
ENV PATH $GOPATH/bin:/usr/local/go/bin:$PATH

# 7. Change the working directory
WORKDIR $GOPATH/src

# 8. Install the development dependencies in $GOPATH/src
RUN go get github.com/go-delve/delve/cmd/dlv
RUN go get github.com/githubnemo/CompileDaemon

# 9. Change the working directory back to /api
WORKDIR /api

# 10. Provide meta data about the ports the container must EXPOSE
# port 4000 -> api port
# port 8888 -> debuggable api port
# port 2345 -> debugger portEXPOSE 4000 8888 2345

# 11. CMD provide defaults for an executing container. CMD ["go", "run" "./cmd/api"]
```

### Demo

In the root directory run the following:

```
docker build --target dev --tag demo/api ./api
```

The `docker build` command builds the a new docker image referencing the Dockerfile inside the api folder. 

The flag `--target` specifies that we only want to target the `dev` stage in the multi-stage setup.

[Multi-stage](https://docs.docker.com/develop/develop-images/multistage-build/) builds help us apply separation of concerns. A multi-stage setup allows you to define different stages of a single Dockerfile and reference them later. In our api Dockerfile, we declared the name of our first stage `as base`.

The flag `--tag` specifies an [image tag](https://docs.docker.com/engine/reference/commandline/tag/) or name we can use to reference the new image, it is tagged `demo/api`.

If you publish a private or public image to [DockerHub](https://hub.docker.com/) (the official Docker image repository) the format DockerHub expects is username/image-name. Since we are not publishing images in this tutorial `demo` doesn't have to be your real username.

### Creating the React app Dockerfile

Add a new `Dockerfile` for the client folder. Open it in your editor. Add the following contents:

```
# 1. Extend the official node image and create a new stage called base
FROM node:10.15.0-alpine as base

# 2. Create the NODE_ENV Environment variable
ENV NODE_ENV=production

# 3. Set the working directory
WORKDIR /client

# 4. Copy both package.json and package-lock.json into /client in the image filesystem
COPY package*.json ./

# 5. Install the production node_modules and clean up the cache 
RUN npm ci \ 
    && npm cache clean --force

# 5. Extend the base stage and create a new stage called dev
FROM base as dev

# 6. Set the NODE_ENV and PATH Environment variables
ENV NODE_ENV=development
ENV PATH /client/node_modules/.bin:$PATH

# 7. Provide meta data about the port the container must EXPOSE
EXPOSE 3000

# 8. Create a new directory and recursively change the ownership to the node user
RUN mkdir /client/app && chown -R node:node .

# 9. Switch to the node user
USER node

# 10. Install development dependencies
RUN npm i --only=development \
    && npm cache clean --force

# 11. Patch create-react-app bug preventing self-signed certificate usage

# https://github.com/facebook/create-react-app/issues/8075
COPY patch.js /client/node_modules/react-dev-utils/webpackHotDevClient.js

# 12. Print npm config for debugging purposes
RUN npm config list

# 13. Change the working directory
WORKDIR /client/app

# 14. Provide defaults for an executing container. 
CMD ["npm", "run", "start"]

# 15. Extend the dev stage and create a new stage called test
FROM dev as test

# 16. Copy the remainder of the client folder source code into the image filesystem
COPY . .

# 17. Run node_module vulnerability checks
RUN npm audit

# 18. Extend the test stage and create a new stage called build-stage
FROM test as build-stage

# 19. Build the production static assets
RUN npm run build

# 20. Extend the official nginx image and create a new stage called prod
FROM nginx:1.15-alpine as prod

# 21. Provide meta data about the port the container must EXPOSE
EXPOSE 80

# 22. Copy only the files we want from the build stage into the prod stage
COPY --from=build-stage /client/app/build /usr/share/nginx/html
COPY --from=build-stage /client/app/nginx.conf /etc/nginx/conf.d/default.conf
```

# Running Containers

Docker compose is a command line tools and configuration file that uses YAML. It is only meant for local development and test automation. For production you are better off using a production grade orchestrator like Docker Swarm or Kubernetes.

With Docker Compose we can run a collection of containers with one command which becomes necessary when containers have relationships and depend on one another.

In the project root, create a `docker-compose.yml` file and open it.

```
touch docker-compose.yml        
```

Add the following content:

```
version: "3.7"
services:
  api:
    build:
      context: ./api
      target: dev
    secrets:
      - postgres_db
      - postgres_user
      - postgres_passwd
    environment:
      ADDR_PORT: 4000
      POSTGRES_HOST: db
      POSTGRES_DB: /run/secrets/postgres_db
      POSTGRES_USER: /run/secrets/postgres_user
      POSTGRES_PASSWORD: /run/secrets/postgres_passwd
    volumes:
      - ./api:/api
    networks:
      - postgres
      - traefik-public

  client:
    build:
      context: ./client
      target: dev
    ports:
      - 3000:3000
    volumes:
      - ./client:/client/app
      - /client/app/node_modules
    networks:
      - traefik-public

  db:
    image: postgres:11.6
    container_name: db
    secrets:
      - postgres_db
      - postgres_user
      - postgres_passwd
    environment:
      POSTGRES_DB_FILE: /run/secrets/postgres_db
      POSTGRES_USER_FILE: /run/secrets/postgres_user
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_passwd
    ports:
      - 5432:5432
    volumes:
      - postgres:/var/lib/postgresql/data
      - ./api/scripts/:/docker-entrypoint-initdb.d/
    networks:
      - postgres

volumes:
  postgres:    external: true

networks:
  postgres:
    external: true
  traefik-public:
    external: true

secrets:
  postgres_db:
    file: ./secrets/postgres_db
  postgres_passwd:
    file: ./secrets/postgres_passwd
  postgres_user:
    file: ./secrets/postgres_user
```

# Live Reloading A Go API

# Debugging A Go API

# Self-Signed Certificates With Traefik

# Running Tests
