---
template: post
title: The Ultimate Go Development Setup with Docker
slug: ultimate-go-development-with-docker
draft: true
date: 2019-12-27T20:51:27.221Z
description: >-
  Lately, I've been interested in migrating APIs from Node to Go. With Node, I
  had the ultimate workflow, but I had a problem achieving a similar one with
  Go. This post illustrates the use of docker compose to automate live reloading
  a Go API on code changes, debugging it with breakpoints and running tests.
category: development
tags:
  - Delve Docker Golang Makefile Postgres Traefik VSCode
---
## 

![ultimate-go-development-with-docker](/media/matthew-sleeper-kn8atn5_zgq-unsplash.jpg "The Ultimate Go Development Setup with Docker")

## Why I'm writing this

Ever since I started deploying apps, leveraging tools like [Docker](https://docs.docker.com/get-started/), [Portainer](https://portainer.io), [Traefik](https://traefik.io) and [Drone](https://drone.io), I have been forced to recognize that many of my beloved infrastructure tools use the Golang programming language. Everywhere I would turn, I was using an open source Go library in my day to day workflow. So I did what anyone would do -- I learned some Go.

It wasn't easy. Being a full stack developer, I immediately wanted things to work like my old workflow in JavaScript. In the past, I could rely on live reloading and debugging in VSCode, but it wasn't obvious how to do so in Go.

As of this writing, I have yet to find a way to live reload a Go api and delve debug it at the same time, in the same container.

I ended up settling with live reloading a Go api in one container and then when needed, launching a debuggable version of the same api in a separate container, without live reload. This seemed to be a good compromise because I'm usually not debugging until I know I have a problem. At that point, I can simply launch another container to investigate.

### The Goal

This tutorial comes with source code. You can either go straight to my [master branch](https://github.com/ivorscott/go-delve-reload/tree/master) and try the completed version for yourself or follow along with the project starter, available under the [starter branch](https://github.com/ivorscott/go-delve-reload/tree/starter).

We will start with a ready-made full stack project. I don't want to teach you how to make a react app or a go api, rather we will focus our attention on building tooling around this full stack project in order to support the ultimate Go development environment with Docker. More specifically, we'll cover using multi-stage builds, docker-compose, live reloading, Traefik, Postgres, testing and debugging with delve locally. Let's begin.

## Setting Up VSCode

I considered making this tutorial IDE agnostic but there are a few amazing VSCode extensions I'd like to share and the last section fully embraces debugging with VSCode. That being said, you don't need any of these extensions I am about to mention, nor do you need to use the delve debugger, but I highly recommend it. 

Download VSCode if you haven't already (its free). Then install the following extensions:

1. [The Go extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode.Go) adds rich language support for the Go language to VSCode.
2. [The Docker extension](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-docker) adds syntax highlighting, commands, hover tips, and linting for Dockerfile and docker-compose files.
3. [The hadolint extension](https://marketplace.visualstudio.com/items?itemName=exiasr.hadolint) also lints your Dockerfiles. It's my go to linter for creating best practice docker images.

Clone [the project repo](https://github.com/ivorscott/go-delve-reload) and checkout out the `starter` branch if you haven't already. 

```
git clone https://github.com/ivorscott/go-delve-reload
cd go-delve-reload
git checkout starter
```

Create a hidden folder named `.vscode` and then a file named `launch.json` under it.

```
mkdir .vscodetouch .vscode/launch.json
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

This will help VSCode remotely attach to the delve debugger inside the container. This will change the look of the debug tab in VSCode, providing you with a "Launch remote" debugging button that you can use to debug any breakpoints you have set. More on this in the last section but the Debug tab should look like this:

![debug-tab](/media/screen-shot-2020-01-05-at-02.33.20.png "Debug tab in VSCode")

Adding the Docker extension also changes the look and feel of the VSCode editor. A new Docker tab should be visible, giving us easy access to manage containers, images, registries, networks and volumes. This prevents us from using the terminal to execute the docker commands that would give us the same results. The new Docker tab should look like this:

![docker-tab](/media/screen-shot-2020-01-05-at-02.33.00.png "Docker tab in VSCode")

## What is Docker anyway?

Docker allows you to package your app and host it on any operating system. No more, "It works on my machine". Docker supports the software lifecycle from development to production. With Docker, software delivery doesn't have to be painful and unpredictable. If you're working in a team. It's useful for operators, system admins, build engineers and developers. Docker's core belief is that it's possible to deliver software fast and in a predictable fashion. 

![use-docker](/media/screen-shot-2020-01-05-at-13.38.25.png "It works on my machine (Slap) --Use Docker!")

### 3 Docker Concepts

### 1. Docker Images

Imagine packaging all your application's binaries and dependencies, meta data included, into a single object, that what a docker image is. It's the source of truth for your app. A docker image is not a virtual machine. There's no Kernel, just the application binaries, meaning you'r not working with a complete operating system you are still leveraging your host machine kernel. So in result your apps consume less resources are are much lighter than a Virtual machine. So it's possible to have hundreds on containers on your machine which wouldn't be possible with VMs.

### 2. The Dockerfile

We still need a recipe to create our personal Docker images, that's where the Dockerfile comes in. In a top down fashion you are actually provide the instructions of how you want to build your image. In the next section, you will see that Dockerfiles actually have their own language to do this.

### 3. Containers

If a Dockerfile is the recipe for a Docker Image, and A Docker Image is the packaged application binaries and dependencies, then a container can be thought of as the running app instance of a particular Docker Image. Later we will use docker-compose to manage our many containers needed for a full stack development project.

## Getting Started

### Creating the Go API Dockerfile

Create a new `Dockerfile` for the api folder and then open it up in your editor.

```
touch api/Dockerfile
```

As stated before, a Dockerfile is just a recipe for a Docker Image. We always start a Dockerfile by referencing a base image. If you wanted to start from completely scratch (an empty container) you would write:

```
FROM scratch
```

Since we're building a go api, in makes logical sense to base our image of [the official golang base image](https://hub.docker.com/_/golang).

```
FROM golang
```

Save the file. Notice that immediately hadolint begins to lint the Dockerfile. It should alert you the following issue:

![](/media/screen-shot-2020-01-05-at-18.57.56.png)

This is great. We can see that in terms of best practice, it best to pin down an image version when referencing one (note: `FROM golang:latest` is not explicit enough ). Update the first line to this instead:

```
FROM golang:1.13.5 as base
```

Here we clearly set an explicit version and also begin to use multi-stage build by specifying that this first line begins the "base" stage by ending with `as base`. Multi-stage builds are handy in applying separation of concerns in a single Dockerfile. As we will see we can target a single stage from many later on. Creating additional stages is as easy as declaring another `FROM` statement and giving it a name. Stages can even reference other stages, for example: 

```
# 2 stage multi-stage example
FROM scratch as base
FROM base as dev
```

Let's add a label below our first line.

```
FROM golang:1.13.5 as base

LABEL maintainer="FIRSTNAME LASTNAME <YOUR@EMAIL.HERE>"
```

Labels allow you to add meta data to your Docker image. 

Next let's define the the current working directory inside the image, so that going forward every subsequent command within the current stage will define under this directory. While we are at it we can copy everything relative to where our Dockerfile is located and place it into the image.

```
WORKDIR /api

COPY . .
```

This has the added effective of moving the entire contents of the project's api folder inside the image.

If we ever want to ignore some files we can create a `.dockerignore` file, which works exactly the same way as `.gitignore` from git. Before moving to the next stage, since we are using go modules we should pre-load all the module dependencies the api needs. Add the following below the copy command.

```
RUN go mod download
```

On a new line, initiate a new stage for development purposes.

```
FROM base as dev
```

To preform live reloading and debugging we need to leverage two packages: CompileDaemon and delve. Let's make sure they are only downloaded within the development stage because we don't need them in production. To do this we need to leverage the `GOPATH`. The `GOPATH` where Go developers use to install packages prior to go modules. Let's define the `GOPATH` as an environment variable and add it to the image's `PATH` environment variable, then change the working directory again so that can specify exactly where we want these development dependencies and keep them separate from our go module dependencies. Add the following immediately after declaring the `dev` stage:

```
ENV GOPATH /go
ENV PATH $GOPATH/bin:/usr/local/go/bin:$PATH

WORKDIR $GOPATH/src

RUN go get github.com/go-delve/delve/cmd/dlv
RUN go get github.com/githubnemo/CompileDaemon
```

The `RUN` command allows us to run any command in the Docker image. Here we download both dependencies in two separate lines. It's worth noting that each line in a Dockerfile is its own image layer. When you build an image, image layers get cached. So when you change code in the api the cache busts for the  `COPY . .` command, so that image layer and every subsequent layer downwards will be forced to rebuild.

At this point, the dev stage is still pointing to `$GOPATH/src`. Let's change that back to where the api code is. In addition, we can `EXPOSE` some port we will be needing later. It's worth noting that the `EXPOSE` command is just meta data. It serves only as a reminder that these ports need to be opened in the container and will not automatically open them for us. The last line below begins yet another stage, the production stage. It is left empty on purpose. It is there only to depict the boarder picture of how you can create a through multi-stage setup, but we won't get into that here in this tutorial.

```
WORKDIR /api
# port 4000 -> api port# port 8888 -> debuggable api port# port 2345 -> debugger port
EXPOSE 4000 8888 2345

FROM base as prod
```

### Demo

```
docker build --target dev --tag reload/api ./api/Dockerfile
```

The above command builds the Dockerfile creating a docker image we can use to create a container. Notice the use of two flags follow by the path to the Dockerfile. The first flag from the left: `--target` specifies that we only want to target the `dev` stage in the multi-stage setup. The second flag: --tag specifies a name for your new image. If you were to publish the image to the official docker hub repository as a private or public image the format Dockerhub understand is username/image-name. Since we are not publishing to Dockerhub whether or not I have a username called `reload` doesn't matter here.

At this point we are still missing the Postgres database. Let's go over the client Dockerfile before attempting to run the image as a container.

By now, your Dockerfile should look similar to this:

```
FROM golang:1.13.5 as base

LABEL maintainer="Ivor Scott <ivor@devpie.io>"

WORKDIR /api

COPY . .

RUN go mod download

# Development
FROM base as dev

ENV GOPATH /go
ENV PATH $GOPATH/bin:/usr/local/go/bin:$PATH

WORKDIR $GOPATH/src

RUN go get github.com/go-delve/delve/cmd/dlv
RUN go get github.com/githubnemo/CompileDaemon

WORKDIR /api

# port 4000 -> api port
# port 8888 -> debuggable api port
# port 2345 -> debugger port
EXPOSE 4000 8888 2345

# Production
FROM base as prod
```



### Creating the React app Dockerfile

The client Dockerfile is a complete multi-stage Dockerfile that I have used previously for developing, testing and deploying react apps. It's a bit more complicated so let's dive in.



```
FROM node:10.15.0-alpine as base

LABEL maintainer="FIRSTNAME LASTNAME <YOUR@EMAIL.HERE>"

ENV NODE_ENV=production

WORKDIR /client

COPY package*.json ./

RUN npm ci \ 
    && npm cache clean --force

FROM base as dev
ENV NODE_ENV=development

ENV PATH /client/node_modules/.bin:$PATH

EXPOSE 3000

RUN mkdir /client/app && chown -R node:node .

USER node
RUN npm i --only=development \
    && npm cache clean --force

COPY patch.js /client/node_modules/react-dev-utils/webpackHotDevClient.js

RUN npm config list
WORKDIR /client/app
CMD ["npm", "run", "start"]

FROM dev as test
COPY . .
RUN npm audit

FROM test as build-stage
RUN npm run build

FROM nginx:1.15-alpine as prod
EXPOSE 80
COPY --from=build-stage /client/app/build /usr/share/nginx/html
COPY --from=build-stage /client/app/nginx.conf /etc/nginx/conf.d/default.conf
```

\[Explain Each Line]

### Demo

\[Build image manually and run it as a containers. Without docker-compose]

## Docker Compose

\[Description]

\[Create file. piece by piece. leave out traefik. leave out debug api. leave out pgadmin]

### Demo

## Makefiles

\[Description]

\[Create file to abstract out docker-compose commands]

### Demo

\[Demo. Show everything still works]

## Live Reloading The API

\[Add CompileDaemon to docker-compose.yml]

### Demo

## Self-signed certificates with Traefik

\[Description]

\[Add Traefik to docker-compose.yml]

### Demo

## Improving The Postgres Workflow

\[Add pgadmin to docker-compose.yml]

\[Add command to makefile]

### Demo

## Running Tests

\[Add commands to makefile to test frontend and backend]

### Demo

## Debugging With VSCode

\[Add debug-api to docker-compose.yml]

\[Add command to makefile]

### Demo

## Conclusion

\[Recap. What makes this the ultimate setup. What to take away.] Happy coding.
