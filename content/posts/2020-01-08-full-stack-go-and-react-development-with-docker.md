---
template: post
title: The Ultimate Go and React Development Setup with Docker
slug: ultimate-go-react-development-setup-with-docker
draft: false
date: 2020-01-08T12:54:37.547Z
description: >-
  Lately, I've been migrating from Node to Golang. With Node I had a great
  development workflow, but I struggled to achieve one in Go. What I wanted was
  the ability to live reload a Go API and to debug it with breakpoints while in
  a container.In this tutorial we will setup the Ultimate Go and React
  development environment with Docker.
category: development
tags:
  - Delve Docker Golang Makefile Postgres Traefik VSCode
---
# Introduction

Lately, I've been migrating from Node to Golang. With Node I had a great development workflow, but struggled to achieve one in Go. What I wanted was the ability to live reload a Go API and to debug it with breakpoints while in a container. In this tutorial we will setup the Ultimate Go and React development environment with Docker. 

I expect you to be familiar with fullstack development. I won't teach you every painstaking detail about how to create a react app or even a Go API. It's fine if you're new to Docker. I'll explain the basics when needed. So relax, you'll be able to copy and paste code as you go.

We focus on :

* [Getting Started](#getting-started)
* [Docker Basics](#docker-basics)
* [Setting Up VSCode](#setting-up-vscode)
* [Multi-stage Builds](#multi-stage-builds)
* [Docker Compose](#docker-compose)
* [Using Traefik](#using-traefik)
* [Using Makefiles](#using-makefiles)
* [Using Postgres](#using-postgres)
* [Live Reloading a Go API](#live-reloading-a-go-api)
* [Delve Debugging a Go API](#delve-debugging-a-go-api)
* [Testing](#testing)

# Getting started

## Requirements

* [VSCode](https://code.visualstudio.com/)
* [Docker](https://www.docker.com/products/docker-desktop)

Clone [the project repo](https://github.com/ivorscott/go-delve-reload) and checkout the `starter` branch.

```
git clone https://github.com/ivorscott/go-delve-reload
cd go-delve-reload
git checkout starter
```

The project starter is a simple mono repo containing two folders. 

```
├── README.md
├── api
├── client
```

# Docker Basics

Docker is useful for operators, system admins, build engineers and developers. 

Docker allows you to package your app and host it on any operating system. This means no more, "It works on my machine" dialogue. 

Docker supports the full software lifecycle from development to production. With Docker, software delivery doesn't have to be a painful and unpredictable process.

## 3 Essentail Concepts

Using Docker often starts with creating a Dockerfile, then building an image, and finally running one or more containers. 

Here's some terminology you should know.

**1. Images**

A Docker image is your application's binaries, dependencies, and meta data included in a single entity, made up of multiple static layers that are cached for reuse. 

**2. Dockerfiles**

A Dockerfile is a recipe of instructions for making images. Each instruction forms its own image layer. 

**3. Containers**

A Docker container is an app instance derived from a Docker Image. A container is not a virtual machine. They differ because each container doesn't require its own operating system. Containers on a single host will actually share a single operating system. This makes them incredibly lightweight. Containers require less system resources, allowing us to run many applications or containers on one machine.

![use-docker](/media/screen-shot-2020-01-05-at-13.38.25.png "It works on my machine (Slap) --Use Docker!")

# Setting Up VSCode

Open VSCode or [install it](https://code.visualstudio.com/download).

Install these two extensions.

1. [The Go Extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode.Go) 
   Adds rich language support for the Go language.
2. [The Docker Extension](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-docker) \
   Adds syntax highlighting, commands, hover tips, and linting for docker related files.

## Go Modules

When using Go modules in a mono repo, VSCode seems to complain when our api is not the project root.

![](/media/screen-shot-2020-01-10-at-03.00.07.png)

Right click below the project tree in the sidebar region to fix this. Click on "Add Folder To Workspace" and select the `api` folder.

![](/media/screen-shot-2020-01-12-at-21.53.08.png)

![](/media/screen-shot-2020-01-10-at-03.08.24.png)

## Setting Up VSCode for Delve Debugging

VSCode will need to attach to the delve debugger inside the go container.

Create a hidden folder named `.vscode` and add `launch.json` to it.

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

# Multi-stage Builds

### Creating the Golang Dockerfile

Add a new `Dockerfile` to the api folder and open it.

```
touch api/Dockerfile
```

 Add the following:

```
# 1. FROM sets the baseImage to use for subsequent instructions.
# Use the Golang image as the base stage of a multi-stage routine
FROM golang:1.13.5 as base

# 2. WORKDIR sets the working directory for any subsequent COPY, CMD, or RUN instructions
# Change directory
WORKDIR /api

# 3. COPY copy files or folders from source to the destination path in the image's filesystem
# Copy the go.mod and go.sum files to /api in the image's filesystem
COPY go.* ./

# 4. RUN executes commands on top of the current image as a new layer and commit the results.
# Install go module dependencies in the image's filesystem
RUN go mod download

# 5. Extend the base stage to create a new stage named dev
FROM base as dev

# 6. ENV sets an environment variable
# Create GOPATH and PATH Environment variables
ENV GOPATH /go
ENV PATH $GOPATH/bin:/usr/local/go/bin:$PATH

# 7. Change directory
WORKDIR $GOPATH/src

# 8. Install development dependencies in $GOPATH/src
RUN go get github.com/go-delve/delve/cmd/dlv
RUN go get github.com/githubnemo/CompileDaemon

# 9. Change directory
WORKDIR /api

# 10. Provide meta data about the ports the container must EXPOSE
# port 4000 -> api port
# port 2345 -> debugger port
EXPOSE 4000 2345

# 11. Extend the dev stage to create a new stage named test
FROM dev as test

# 12. Copy the remaining api code into /api in the image's filesystem
COPY . . 

# 13. Run unit tests
RUN go test -v ./...

# 14. Extend the test stage to create a new stage named build-stage
FROM test as build-stage

# 15. Provide defaults for an executing container.
RUN go build -o main ./cmd/api

# 16. Extend the scratch stage to create a new stage named prod
FROM scratch as prod

# 17. Copy only the files we want from the build stage into the prod stage
COPY --from=build-stage /api/main main

# 18. CMD Provide defaults for an executing container. 
CMD ["./main"]
```

### Demo

In the root directory run the following to build the api development image:

```
docker build --target dev --tag demo/api ./api
```

The `docker build` command builds a new docker image referencing our Dockerfile.

`--target` specifies that we only want to target the `dev` stage in the multi-stage build setup.

[Multi-stage builds](https://docs.docker.com/develop/develop-images/multistage-build/) help us apply separation of concerns. In a multi-stage build setup, you define different stages of a single Dockerfile. Then you reference specific stages later. In our api Dockerfile, we declared the name of our first stage `as base`.

`--tag` specifies an [image tag](https://docs.docker.com/engine/reference/commandline/tag/). An image tag is just a name we can use to reference the image, it is tagged `demo/api`.

If your goal is to publish to [DockerHub](https://hub.docker.com/) you can make a private or public image. The basic format DockerHub expects is username/image-name. Since we are not publishing images in this tutorial `demo` doesn't have to be your real username. 

### Creating the React Dockerfile

Add a new `Dockerfile` to the client folder and open it. 

```
touch client/Dockerfile
```

Add the following contents:

```
# 1. Use the Node image as the base stage of a multi-stage routine
FROM node:10.15.0-alpine as base

# 2. Set the NODE_ENV Environment variable
ENV NODE_ENV=production

# 3. Set the working directory
WORKDIR /client

# 4. Copy both package.json and package-lock.json into /client in the image's filesystem
COPY package*.json ./

# 5. Install the production node_modules and clean up the cache 
RUN npm ci \ 
    && npm cache clean --force

# 5. Extend the base stage to create a new stage named dev
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

# 13. Change directory
WORKDIR /client/app

# 14. Provide defaults for an executing container. 
CMD ["npm", "run", "start"]

# 15. Extend the dev stage and create a new stage called test
FROM dev as test

# 16. Copy the remainder of the client folder source code into the image filesystem
COPY . .

# 17. Run node_module vulnerability checks
RUN npm audit

# 18. Run unit tests
RUN npm test

# 19. Extend the test stage to create a new stage named build-stage
FROM test as build-stage

# 20. Build the production static assets
RUN npm run build

# 21. Extend Nginx image to create a new stage named prod
FROM nginx:1.15-alpine as prod

# 22. Provide meta data about the port the container must EXPOSE
EXPOSE 80

# 23. Copy only the files we want from the build stage into the prod stage
COPY --from=build-stage /client/app/build /usr/share/nginx/html
COPY --from=build-stage /client/app/nginx.conf /etc/nginx/conf.d/default.conf
```

### Demo

In the root directory run the following to build the client development image:

```
docker build --target dev --tag demo/client ./client
```

In this section, we saw how we use Dockerfiles to package up our application binaries with dependencies. We also used the `docker build` command to manually build our docker images. In the next section we will use `docker-compose` to build our images and run containers.

# Docker Compose

## Running Containers

With our Docker images building successfully we are ready to run our application instances.

`docker-compose` is a command line tool and configuration file for running containers. You should only use it for local development and test automation. It was never designed for production. For production, you are better off using a production grade orchestrator like Docker Swarm -- [here's why](https://github.com/BretFisher/ama/issues/8).

_**\*\*Note\*\*:** _[_Kubernetes_](https://kubernetes.io/) _is another popular production grade orchestrator. In development, I normally don't use an orchestrator. In future posts I will touch on both Docker Swarm and Kubernetes in production._

With docker-compose we can run a collection of containers with one command. It makes running multiple containers far easier especially when containers have relationships and depend on one another.

In the project root, create a `docker-compose.yml` file and open it.

```
touch docker-compose.yml        
```

Add the following:

```
version: "3.7"
services:
  traefik:
    image: traefik:v2.1.2
    container_name: traefik
    command:
      - "--api.insecure=true" # Not For Production
      - "--api.debug=true"
      - "--log.level=DEBUG"
      - "--providers.docker"
      - "--providers.docker.exposedbydefault=false"
      - "--providers.docker.network=traefik-public"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
    ports:
      - 80:80
      - 443:443
      - 8080:8080
    volumes:      # Required for Traefik to listen to the Docker events
      - /var/run/docker.sock:/var/run/docker.sock:ro

    networks:
      - traefik-public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.traefik.tls=true"
      - "traefik.http.routers.traefik.rule=Host(`traefik.api.local`)"
      - "traefik.http.routers.traefik.service=api@internal"
      - "traefik.http.routers.http-catchall.rule=hostregexp(`{host:.+}`)"
      - "traefik.http.routers.http-catchall.entrypoints=web"
      - "traefik.http.routers.http-catchall.middlewares=redirect-to-https@docker"
      - "traefik.http.middlewares.redirect-to-https.redirectscheme.scheme=https"
  api:
    build:
      context: ./api
      target: dev
    container_name: api
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
      - postgres-net
      - traefik-public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.tls=true"
      - "traefik.http.routers.api.rule=Host(`api.local`)"
      - "traefik.http.routers.api.entrypoints=websecure"
      - "traefik.http.services.api.loadbalancer.server.port=4000"
    command: CompileDaemon --build="go build -o main ./cmd/api" --command=./main

  client:
    build:
      context: ./client
      target: dev
    container_name: client
    ports:
      - 3000:3000
    volumes:
      - ./client:/client/app
      - /client/app/node_modules
    networks:
      - traefik-public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.client.tls=true"
      - "traefik.http.routers.client.rule=Host(`client.local`)"
      - "traefik.http.routers.client.entrypoints=websecure"
      - "traefik.http.services.client.loadbalancer.server.port=3000"

  debug-api:
    build:
      context: ./api
      target: dev
    container_name: debug-api
    secrets:
      - postgres_db
      - postgres_user
      - postgres_passwd
    environment:
      ADDR_PORT: 8888
      POSTGRES_HOST: db
      POSTGRES_DB: /run/secrets/postgres_db
      POSTGRES_USER: /run/secrets/postgres_user
      POSTGRES_PASSWORD: /run/secrets/postgres_passwd
    volumes:
      - ./api:/api
    ports:
      - 2345:2345
    networks:
      - postgres-net
      - traefik-public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.debug-api.tls=true"
      - "traefik.http.routers.debug-api.rule=Host(`debug.api.local`)"
      - "traefik.http.routers.debug-api.entrypoints=websecure"
      - "traefik.http.services.debug-api.loadbalancer.server.port=8888"      # run a container without the default seccomp profile      # https://github.com/go-delve/delve/issues/515
    security_opt:
      - "seccomp:unconfined"
    tty: true
    stdin_open: true
    command: dlv debug --accept-multiclient --continue --headless --listen=:2345 --api-version=2 --log ./cmd/api/

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
      - postgres-db:/var/lib/postgresql/data
      - ./api/scripts/:/docker-entrypoint-initdb.d/
    networks:
      - postgres-net

  pgadmin:
    image: dpage/pgadmin4
    container_name: pgadmin
    environment:
      PGADMIN_DEFAULT_EMAIL: test@example.com
      PGADMIN_DEFAULT_PASSWORD: "SuperSecret"
    depends_on:
      - db
    networks:
      - postgres-net
      - traefik-public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.pgadmin.tls=true"
      - "traefik.http.routers.pgadmin.rule=Host(`pgadmin.local`)"
      - "traefik.http.routers.pgadmin.entrypoints=websecure"
      - "traefik.http.services.pgadmin.loadbalancer.server.port=80"
    restart: unless-stopped

volumes:
  postgres-db:
    external: true

networks:
  postgres-net:
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

Create a `secrets` folder in the project root.

```
mkdir secrets
```

 Add the following secret files.

```
└── secrets
   ├── postgres_db
   ├── postgres_passwd
   └── postgres_user
```

```
touch secrets/postgres_db secrets/postgres_passwd secrets/postgres_user
```

In each file add some secret value.

The following code in our docker-compose.yml file tells docker-compose that the volume, and networks will be created beforehand (or externally).

```
volumes:
  postgres-db:
    external: true

networks:
  postgres-net:
    external: true
  traefik-public:
    external: true
```

So we need to create them upfront. Run the following commands to do so.

```
docker network create postgres-net
docker network create traefik-public
```

```
docker volume create postgres-db
```

Navigate to your host machine's  `/etc/hosts` file and open it. 

```
sudo vim /etc/hosts
```

Add an additional line containing the following domains.

```
127.0.0.1       client.local api.local debug.api.local traefik.api.local pgadmin.local 
```

### Demo

```
docker-compose up
```

In two separate browser tabs, navigate to <https://api.local/products> and then <https://client.local>

_**\*\*Note\*\*:** In your browser, you may see warnings prompting you to click a link to continue to the requested page. This is quite common when using self-signed certificates and shouldn't be a reason of concern._

The reason we are using self-signed certificates in the first place is to replicate the production environment as much as possible.

You should see the products being shown in the react app, meaning the `traefik`, `api`, `client`, and `db` containers are communicating successfully.

![](/media/screen-shot-2020-01-12-at-23.49.05.png)

![](/media/screen-shot-2020-01-12-at-23.52.47.png)

### Cleaning up

Run the following to stop and remove all the containers we created with the `docker-compose up` command. In addition to that also remove the external volume and networks we created. In the _Using Makefiles_ section, our makefile will create these for us.

```
docker-compose down
docker network remove postgres-net
docker network remove traefik-public
docker volume remove postgres-db
```

# Using Traefik

Our docker-compose.yml file was already configured to generate self-signed certificates with Traefik. 

You might be wondering what [Traefik](https://containo.us/traefik/) is in the first place.

Traefik's documentation states: 

> Traefik is an open-source Edge Router that makes publishing your services a fun and easy experience. It receives requests on behalf of your system and finds out which components are responsible for handling them.
>
> What sets Traefik apart, besides its many features, is that it automatically discovers the right configuration for your services. The magic happens when Traefik inspects your infrastructure, where it finds relevant information and discovers which service serves which request.
>
> \-- https://docs.traefik.io/#the-traefik-quickstart-using-docker

Revisit the `traefik` service in our compose file.

```
 traefik:
    image: traefik:v2.1.2
    command:
      - "--api.insecure=true" # Not For Production
      - "--api.debug=true"
      - "--log.level=DEBUG"
      - "--providers.docker"
      - "--providers.docker.exposedbydefault=false"
      - "--providers.docker.network=traefik-public"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
    ports:
      - 80:80
      - 443:443
      - 8080:8080
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro

    networks:
      - traefik-public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.traefik.tls=true"
      - "traefik.http.routers.traefik.rule=Host(`traefik.api.local`)"
      - "traefik.http.routers.traefik.service=api@internal"
      - "traefik.http.routers.http-catchall.rule=hostregexp(`{host:.+}`)"
      - "traefik.http.routers.http-catchall.entrypoints=web"
      - "traefik.http.routers.http-catchall.middlewares=redirect-to-https@docker"
      - "traefik.http.middlewares.redirect-to-https.redirectscheme.scheme=https"
```

We leverage the official Traefik image from DockerHub, version 2.1.2. We can configure Traefik using command line flags and labels. 

**\*_\*Note\**:_** _You can also configure Traefik using TOML files and YAML files._

![](/media/screen-shot-2020-01-12-at-17.25.23.png)

I prefer using CLI flags because I don't want to worry about storing the TOML file in production. I also like the idea of only relying on one docker-compose.yml file to set everything up. 

## Line by Line: How It Works

Let's start with the command line flags.

```
--api.insecure=true
```

The API is exposed on the traefik entry point (port 8080).

```
--api.debug=true
```

Enable additional endpoints for debugging and profiling.

```
--log.level=DEBUG
```

Set the log level to DEBUG. By default, the log level is set to ERROR. Alternative logging levels are DEBUG, PANIC, FATAL, WARN, and INFO.

```
--providers.docker
```

There are various providers to chose from, this line explicitly selects docker.

```
--providers.docker.exposedbydefault=false
```

Restrict Traefik's routing configuration from exposing all containers by default. Only containers with `traefik.enable=true` label will be exposed.

```
--providers.docker.network=traefik-public
```

Defines a default network to use for connections to all containers.

```
--entrypoints.web.address=:80
```

Create an entrypoint named web on port 80 to handle http connections.

```
--entrypoints.websecure.address=:443
```

Create an entrypoint named websecure on port 443 to handle https connections.

Next we will cover the labels on the traefik service.

```
- "traefik.enable=true"
```

Tell Traefik to include the service in its routing configuration.

```
- "traefik.http.routers.traefik.tls=true"
```

Enable TLS certificates.

```
- "traefik.http.routers.traefik.rule=Host(`traefik.api.local`)"
```

Set a host matching rule to redirect all traffic matching this request to the container.

```
- "traefik.http.routers.traefik.service=api@internal"
```

If you enable the API, a new special service named api@internal is created and can be referenced in a router. This label attaches to Traefik's internal api so we can access the dashboard.

![](/media/screen-shot-2020-01-12-at-20.26.12.png)

The next group of labels creates a router named http-catchall that will catch all HTTP requests and forwards it to a router called redirect-to-https. This has the added benefit of redirecting our traffic to https.

```
- "traefik.http.routers.http-catchall.rule=hostregexp(`{host:.+}`)"
- "traefik.http.routers.http-catchall.entrypoints=web"
- "traefik.http.routers.http-catchall.middlewares=redirect-to-https@docker"
- "traefik.http.middlewares.redirect-to-https.redirectscheme.scheme=https"
```

Now revisit the `client` service.

```
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
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.client.tls=true"
      - "traefik.http.routers.client.rule=Host(`client.local`)"
      - "traefik.http.routers.client.entrypoints=websecure"
      - "traefik.http.services.client.loadbalancer.server.port=3000"
```

## Line by Line: How It Works

```
- "traefik.enable=true" 
```

Tell Traefik to include the service in its routing configuration.

```
- "traefik.http.routers.client.tls=true"
```

To update the router configuration automatically attached to the application, we add labels starting with `traefik.http.routers.{router-name-of-your-choice}` followed by the option you want to change.  In this case, we enable tls encryption.

```
- "traefik.http.routers.client.rule=Host(`client.local`)"
```

Set a host matching rule to redirect all traffic matching this request to the container.

```
- "traefik.http.routers.client.entrypoints=websecure"
```

Configure Traefik to expose the container on the websecure entrypoint.

```
- "traefik.http.services.client.loadbalancer.server.port=3000"
```

Tell Traefik that the container will be exposed on port 3000 internally.

Before Traefik, I was configuring a nginx reverse proxy from scratch. Each time I added an additional service I had to update my nginx config. Not only is this not scalable it became easy to make a mistake. With Traefik, reverse proxying services is easy. 

# Using Makefiles

It can be a hassle to type various docker commands. [GNU Make](https://www.gnu.org/software/make/) is a build automation tool that automatically builds executable programs from source code by reading files called Makefiles.

Here's an example makefile:

```
#!make 
hello: hello.c
  gcc hello.c -o hello
```

The main feature we care about is:

> \[ The ability ] to build and install your package without knowing the details of how that is done -- because these details are recorded in the makefile that you supply. 
>
> \-- https://www.gnu.org/software/make/

\
The syntax is:

```
target: prerequisite prerequisite prerequisite ...
(TAB) commands 
```

_**\*\*Note\*\*:** targets and prerequisites don't have to be files._ 

In the command line, we would run this example makefile by typing `make` or `make hello`. Both would work because when a target is not specified the first target in the makefile is executed. 

## Creating the Makefile

Create a `makefile` in your project root and open it. 

```
touch makefile
```

Add the following contents:

```
#!make

NETWORKS="$(shell docker network ls)"
VOLUMES="$(shell docker volume ls)"
POSTGRES_DB="$(shell cat ./secrets/postgres_db)"
POSTGRES_USER="$(shell cat ./secrets/postgres_user)"
POSTGRES_PASSWORD="$(shell cat ./secrets/postgres_passwd)"
SUCCESS=[ done "\xE2\x9C\x94" ]

# default arguments
user ?= root
service ?= api

all: traefik-network postgres-network postgres-volume
	@echo [ starting client '&' api... ]
	docker-compose up --build traefik client api db pgadmin

traefik-network:
ifeq (,$(findstring traefik-public,$(NETWORKS)))
	@echo [ creating traefik network... ]
	docker network create traefik-public
	@echo $(SUCCESS)
endif

postgres-network:
ifeq (,$(findstring postgres-net,$(NETWORKS)))
	@echo [ creating postgres network... ]
	docker network create postgres-net
	@echo $(SUCCESS)
endif

postgres-volume:
ifeq (,$(findstring postgres-db,$(VOLUMES)))
	@echo [ creating postgres volume... ]
	docker volume create postgres-db
	@echo $(SUCCESS)
endif

api: traefik-network postgres-network postgres-volume
	@echo [ starting api... ]
	docker-compose up traefik api db pgadmin

down:
	@echo [ teardown all containers... ]
	docker-compose down
	@echo $(SUCCESS)

tidy: 
	@echo [ cleaning up unused $(service) dependencies... ]
	@make exec service="api" cmd="go mod tidy"

exec:
	@echo [ executing $(cmd) in $(service) ]
	docker-compose exec -u $(user) $(service) $(cmd)
	@echo $(SUCCESS)

test-client:
	@echo [ running client tests... ]
	@make exec service="client" cmd="npm test"

test-api:
	@echo [ running api tests... ]
	@make exec service="api" cmd="go test -v ./..."

debug-api:
	@echo [ debugging api... ]
	docker-compose up traefik debug-api db pgadmin

debug-db:
	@# advanced command line interface for postgres
	@# includes auto-completion and syntax highlighting. https://www.pgcli.com/
	@docker run -it --rm --net postgres-net dencold/pgcli postgresql://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@db:5432/$(POSTGRES_DB)

dump:
	@echo [ dumping postgres backup for $(POSTGRES_DB)... ]
	@docker exec -it db pg_dump --username $(POSTGRES_USER) $(POSTGRES_DB) > ./api/scripts/backup.sql
	@echo $(SUCCESS)

.PHONY: all
.PHONY: traefik-network
.PHONY: postgres-network
.PHONY: postgres-volume
.PHONY: api
.PHONY: down
.PHONY: tidy
.PHONY: exec
.PHONY: test-client
.PHONY: test-api
.PHONY: debug-api
.PHONY: debug-db
.PHONY: dump
```

### Demo

```
make
```

When you execute a target, each command in the target's command body will be printed to stdout in a self documenting way and then executed. If you don't want a command printed to stdout but you want it executed, you can add the "@" symbol before it. Makefile comments are preceded by a "#" symbol. Using "@#" before a command will hide it from stdout and never execute.

I added documentation to every target using `echo` to describe what each one does. 

Our makefile now creates our an external database volume and 2 networks. We needed a way to test if we have done this already. 

```
ifeq (,$(findstring postgres-net,$(NETWORKS)))
	# do something
endif
```

If we find the `postgres-net` network in `$(NETWORKS)` we do nothing, otherwise we create the network. The conditional statement seems a bit strange because the first argument in the condition is empty, perhaps it can be better understood as `ifeq (null,$(findstring postgres-net,$(NETWORKS)))` but actually the code above is the proper syntax.

## Variables

Variables can be defined at the top of a Makefile and referenced later. 

```
#!make
NETWORKS="$(shell docker network ls)"
```

## Environment Variables

Using the syntax `$(shell <command>)` is one way to execute a command and store its value in a variable.

Environment variables from a .env file can be referenced as long as you include it at the top of the makefile.

```
#!make
include .env

target:     
    echo ${MY_ENV_VAR} 
```

## Phony Targets

A makefile can't distinguish between a file target and a phony target.

> A phony target is one that is not really the name of a file; rather it is just a name for a recipe to be executed when you make an explicit request. There are two reasons to use a phony target: to avoid a conflict with a file of the same name, and to improve performance.
>
> \-- https://www.gnu.org/software/make/manual/html_node/Phony-Targets.html

 Each of our commands are `.PHONY:` targets because they don't represent files.

# Using Postgres

## Debugging Postgres in the Terminal

We still haven't discussed how to interact with Postgres. Eventually you're going to want to enter the running Postgres container to make queries or debug.

### Demo

```
make debug-db
```

You should be automatically logged in. Run a couple commands to get a feel for it.

```
\dt
```

```
select name, price from products
```

The `debug-db` target uses an advanced command line interface for Postgres called [pgcli](https://www.pgcli.com/).

This is great. We now have a user friendly terminal experience with syntax highlighting and auto completion. 

![](/media/screen-shot-2020-01-12-at-21.43.06.png)

## PGAdmin4: Debugging Postgres in the Browser

Not everyone likes the terminal experience when working with Postgres. We also have a browser option using [pgAdmin4](https://www.pgadmin.org/download/pgadmin-4-container/). 

To login, the email is `test@example.com` and the password is `SuperSecret.` If you want to change these values they are located in the docker-compose.yml file. Change the environment variables `PGADMIN_DEFAULT_EMAIL` and `PGADMIN_DEFAULT_PASSWORD` to whatever you want.

### Demo

Navigate to [https://pgadmin.local ](https://pgadmin.local)in your browser and login.

Click on "Add New Server".

![](/media/screen-shot-2020-01-09-at-20.58.30.png)

The two tabs you need to modify are "General" and "Connection". Add the name of the database under General.

![](/media/screen-shot-2020-01-09-at-20.59.11.png)

Under the "Connection" tab, fill in the host name which should be `db` unless you changed it in your docker-compose.yml file. Make your database the maintenance database. Then add your username, password and check save password. Lastly, click "Save".

![](/media/screen-shot-2020-01-09-at-21.00.08.png)

![](/media/screen-shot-2020-01-09-at-21.03.59.png)

![](/media/screen-shot-2020-01-09-at-21.04.07.png)

## Making Postgres Database Backups

Making database backups of your Postgres database is straight forward. 

```
dump:
	@echo [ dumping postgres backup for $(POSTGRES_DB)... ]
	@docker exec -it db pg_dump --username $(POSTGRES_USER) $(POSTGRES_DB) > ./api/scripts/backup.sql
	@echo $(SUCCESS)
```

### Demo

```
make dump
```

You're probably wondering how the Postgres database got seeded with data in the first place.

The official Postgres image states: 

> If you would like to do additional initialization in an image derived from this one, add one or more \*.sql, \*.sql.gz, or *.sh scripts under /docker-entrypoint-initdb.d (creating the directory if necessary).
>
> After the entrypoint calls initdb to create the default postgres user and database, it will run any \*.sql files, run any executable \*.sh scripts, and source any non-executable *.sh scripts found in that directory to do further initialization before starting the service.
>
> \-- https://hub.docker.com/_/postgres

The database creation script located under `api/scripts/create-db.sh` is used to seed the database.

```
#!/bin/bash
set -e

if [ ! -f "/docker-entrypoint-initdb.d/backup.sql" ]; then

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -- <<-EOSQL
    CREATE TABLE products (
        id serial primary key,
	    name varchar(100) not null,
	    price real not null,
	    description varchar(100) not null,
	    created timestamp without time zone default (now() at time zone 'utc')
    );
    INSERT INTO products (name, price, description)
    VALUES
        ('Xbox One X', 499.00, 'Eighth-generation home video game console developed by Microsoft.'),
        ('Playsation 4', 299.00, 'Eighth-generation home video game console developed by Sony Interactive Entertainment.'),
        ('Nintendo Switch', 299.00, 'Hybrid console that can be used as a stationary and portable device developed by Nintendo.');
    SELECT name, price from products;
EOSQL
fi
```

In our docker-compose.yml file, `create-db.sh` is bind mounted into the db container:

```
    volumes:
      - postgres:/var/lib/postgresql/data
      - ./api/scripts/:/docker-entrypoint-initdb.d/
```

`create-db.sh` only runs if a backup doesn't exist. That way, if you make a backup, (which is automatically placed in the `api/scripts` directory), and you remove the database volume, then restart the database container, the next time around, `create-db.sh` will be ignored and only the backup will be used.

# Live Reloading a Go API

Our go api is already reloadable thanks to this line in our docker-compose.yml file.

```
CompileDaemon --build="go build -o main ./cmd/api" --command=./main
```

If your familiar with Node, [Compile Daemon](https://github.com/githubnemo/CompileDaemon) watches your .go files and restarts your server just like nodemon.

`--build` is used to specify the command we want to run when rebuilding (this flag is required).

`--command` is used to specify the command to run after a successful build (this flag defaults to nothing).

### Demo

To see this in action make sure your api is running. Then make a change to any api file to see it rebuild.

# Delve Debugging a Go API

[Delve](https://github.com/go-delve/delve) has become the de facto standard debugger for the Go programming language. To use it with VSCode, we needed to add a launch script so that VSCode could to attach to the debugger in the go container. With delve installed, the following line is how we actually execute it at the container level.

```
dlv debug --accept-multiclient --continue --headless --listen=:2345 --api-version=2 --log ./cmd/api/
```

We use `dlv debug` to compile and begin debugging the main package located in the `./cmd/api/` directory.

`--accept-multiclient` allows a headless server to accept multiple client connections.

`--continue` continues the debugged process on start which is not the default.

`--headless` runs the debug server only in headless mode.

`--listen` sets the debugging server listen address.

`--api-version` will specify the API version when headless and

`--log` enables debugging server logging.

### Demo

```
make debub-api
```

Go to `/api/internal/handlers.go` and place a break point in one of the handlers. Within VSCode, click the "Launch Remote" button in the debugger tab. Next, navigate to the route that triggers the handler. You should see the editor pause where you placed the break point. 

![](/media/screen-shot-2020-01-12-at-21.24.33.png)

# Testing

Unit tests do not require you to have the applications running to make a test.

### Demo

```
make test-client
make test-api
```

![](/media/screen-shot-2020-01-12-at-21.27.09.png)

![](/media/screen-shot-2020-01-12-at-21.30.16.png)

In your CI build system you can simply build the test stage of your docker images to run unit tests.

```
docker build --target test --tag demo/client:test ./client
```

```
docker build --target test --tag demo/api:test ./api
```

# Conclusion

I hope you've learned a bunch about how you can build the ultimate Go and React development setup with Docker. No matter what language you use on the client and server side, the basic principles still apply. Enjoy improving your own developer workflow. Happy Coding.
