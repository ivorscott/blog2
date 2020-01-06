---
template: post
title: The Ultimate Go and React Development Setup with Docker
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

By now, your api Dockerfile should look similar to this:

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
EXPOSE 4000 8888 2345FROM dev as testRUN go test -v ./...

# Production
FROM base as prod
```

### Demo

```
docker build --target dev --tag reload/api ./api
```

The above command builds the Dockerfile creating a docker image we can use to create a container. Notice the use of two flags followed by the path to the directory where the Dockerfile lives, also known as the build context. The first flag from the left: `--target` specifies that we only want to target the `dev` stage in the multi-stage setup. The second flag: --tag specifies a name for your new image. If you were to publish the image to the official docker hub repository as a private or public image the format Dockerhub understand is username/image-name. Since we are not publishing to Dockerhub whether or not I have a username called `reload` doesn't matter here. 

The terminal output of the image build should show each step, or image layer, followed by a successful message at the end. 

At this point we are still missing the Postgres database. Let's go over the client Dockerfile before attempting to run the image as a container.

### Creating the React app Dockerfile

The client Dockerfile is a complete multi-stage Dockerfile that I have used previously for developing, testing and deploying react apps. It's a bit more complicated so let's dive in.

First we need to determine which base image we would like to extend from our `base` stage.

```
FROM node:10.15.0-alpine as base
```

I have gone ahead and specified the node:10.15.0-apline image. Apline image are incredible small and lightweight. The lighter the image the better.

**Note:** Alpine images are so light weight, they remove some parts required for image scanning tools to detect vulnerabilities. We won't be including any image scanning tools in this tutorial but It's worth mentioning that such a thing exists. 

Lets's add some meta data to the client Dockerfile just like before:

```
LABEL maintainer="FIRSTNAME LASTNAME <YOUR@EMAIL.HERE>"
```

Will start consider the production environment early on. Use the ENV command to set NODE_ENV to production

```
ENV NODE_ENV=production
```

Change the working directory to where the react app will live.

```
WORKDIR /client
```

Copy over the package.json and package.lock files. This way if the packages changes we are certain to re-install production dependencies on the next rebuild when the cache busts.

```
COPY package*.json ./
```

Next install only the production dependencies and clean up after.

```
RUN npm ci \ 
    && npm cache clean --force
```

Create a new `dev` stage and set the `NODE_ENV` environment variable to development. Ensure to also include an updated PATH environment variable so that the container knows where to look for node_modules.

```
FROM base as dev
ENV NODE_ENV=development

ENV PATH /client/node_modules/.bin:$PATH
```

Create some meta data to remember to `EXPOSE` port 3000, the default create-react-app port.

```
EXPOSE 3000
```

During development we usually mirror the files on the host machine inside the container. We will be doing this later with the go api too so that we can make a change in the code editor and see those changes reflected in the container. 

A common issue is with node modules is that, some modules like node-gyp, are  installed specifically for the host machine architecture. This mean if your working on a mac or windows machine. The node_modules can result in completely different binaries then the linux node_modules in the container. 

One solution is to never run npm install on the host machine. However, this is a bit annoying. While doing that works, VSCode will show errors on node_module imports because it can't find the node_modules on the host machine and doesn't know how to look inside the container to find the node_modules. 

To prevent these issues, there's a clever trick that involved hiding the host machines node modules from the container and installing the node_modules in a parent directory inside the container. This will make more sense when we start defining the docker-compose.yml file. 

Create a `RUN` command that creates an app directory where the react app src code will live and recursively change  everything inside the client directory to be owned by the node user with is much safer that being root which is the default.

```
RUN mkdir /client/app && chown -R node:node .
```

Now switch to the node user.

```
USER node
```

We already installed the production dependency in the client directory. Now we will Install the development dependencies since we are in the `dev` stage. Don't forget to clean up the cache after.

```
RUN npm i --only=development \
    && npm cache clean --force
```

As of January 6th, 2020, create-react-app has a [bug](https://github.com/facebook/create-react-app/issues/8075) preventing the usage of self-sign certificates which you will apply later with Traefik. So the next step shouldn't be required, it just a hot fix. Apparently, there's already a fix for this pending but its not yet available in a fresh install of create-react-app. Anyhow, this is a great example of how Docker can remove the many obstacles that occasionally pop up in the software lifecycle.

```
COPY patch.js /client/node_modules/react-dev-utils/webpackHotDevClient.js
```

The next line is for debugging purposes only. When something goes wrong it may be nice to see the npm configuration your app is using.

```
RUN npm config list
```

Before we go to the next line. Please take note that the node_modules are inside the client directory not inside the app directory we are about to create. Later in your docker-compose.yml file, you will hide the host machine's node_modules from the container, causing node to traverse up the folder hierarchy until it finds the node_modules we placed in the client directory. That's the trick to prevent node_modules issues in Docker during development.

Let's continue. Create an `app` directory under the `client` directory and start the react app.

```
WORKDIR /client/app
CMD ["npm", "run", "start"]
```

Our multi-stage setup wouldn't be complete without a test stage. Base it off of the `dev` stage with already contains all the production and dev dependencies. Then run some tests.

```
FROM dev as test
COPY . .
RUN npm auditRUN npm test
```

Here, `npm audit` will look for node_modules vulnerabilities. The build will fail if the process exits early. `npm test` runs the react app tests.

You are almost done with this Dockerfile. Next you want to execute the production build. Give you self and additional stage called `build-stage`. Then execute the build. 

```
FROM test as build-stage
RUN npm run build
```

Set up a new production stage named `prod` based off the nginx web server which will serve  the static assets from the build and provide some meta data to remind the reader to `EXPOSE` port 80, which is nginx's default port.

```
FROM nginx:1.15-alpine as prodEXPOSE 80
```

The last thing to do is to grab the nginx configuration from the project and only the built assets from the build-stage, leaving everything else behind, making the production image as small as possible.

```
COPY --from=build-stage /client/app/build /usr/share/nginx/html
COPY --from=build-stage /client/app/nginx.conf /etc/nginx/conf.d/default.conf
```

The final client Dockerfile should look something like this:

```
FROM node:10.15.0-alpine as base

LABEL maintainer="Ivor Scott <ivor@devpie.io>"

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

### Demo

```
docker build --target dev --tag reload/client ./clientdocker build --target test --tag reload/client-test ./clientdocker build --target prod --tag reload/client-prod ./client
```

## Docker Compose

Docker compose is a command line tools and configuration file. It uses YAML. It helps you a bunch on containers that have relationships with one another. It's worth noting that docker-compose is meant for local development and test automation. Its not a production grade tool. For production you are better off using a production grade orchestrator like Docker Swarm or Kubernetes.

Create a docker-compose.yml file in the project root and open it up in your editor.

```
touch docker-compose.yml        
```

By the end of this tutorial we will have composed 6 containers. Let's accomplish this first 3 needed to see something working in the browser. We will go line by line. The first line in a compose file is the version number.

```
version: "3.7"
```

Different versions support different features.

To add containers to the docker-compose.yml file you first declare the `services:` key and then a list of containers beneath it. The configuration for each container goes immediately after it. 

```
version: "3.7"
services:  
  api:    
    # api config ...
  client:        
    #  client config...  
  db:    
    # db config...
```

Begin with the api container.

```
  api:
    build:
      context: ./api
      target: dev
    secrets:
      - postgres_db
      - postgres_host
      - postgres_user
      - postgres_passwd
    environment:
      ADDR_PORT: 4000
      POSTGRES_HOST: /run/secrets/postgres_host
      POSTGRES_DB: /run/secrets/postgres_db
      POSTGRES_USER: /run/secrets/postgres_user
      POSTGRES_PASSWORD: /run/secrets/postgres_passwd
    volumes:
      - ./api:/api
    networks:
      - postgres
      - traefik-public
```

Next comes the client container.

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
```

The Go api needs to communicate with a Postgres database. Create a container for that as well. 

```
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
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
```

At the very bottom of the file we need to create the volumes, networks and secrets need by the containers.

```
volumes:
  postgres:

networks:
  postgres:
    external: true
  traefik-public:
    external: true

secrets:
  postgres_db:
    file: ./secrets/postgres_db
  postgres_host:
    file: ./secrets/postgres_host
  postgres_passwd:
    file: ./secrets/postgres_passwd
  postgres_user:
    file: ./secrets/postgres_user
```

Your docker-compose.yml file should now look like this:

```
version: "3.7"
services:
  api:
    build:
      context: ./api
      target: dev
    secrets:
      - postgres_db
      - postgres_host
      - postgres_user
      - postgres_passwd
    environment:
      ADDR_PORT: 4000
      POSTGRES_HOST: /run/secrets/postgres_host
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
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres:

networks:
  postgres:
    external: true
  traefik-public:
    external: true

secrets:
  postgres_db:
    file: ./secrets/postgres_db
  postgres_host:
    file: ./secrets/postgres_host
  postgres_passwd:
    file: ./secrets/postgres_passwd
  postgres_user:
    file: ./secrets/postgres_user
```

### Demo

```
docker-compose up
```

```
docker-compose down
```

## Makefiles

In development with docker there will be a series of commands you will write to perform some task. Its a hassle to remember all the various commands and even if you know them all it can be annoying to type. GNU Make or Makefiles, are great for abstracting away the commands to shorter memorable names. 

Originally, Makefiles were design to automate the mundane aspects of transforming source code into an executable. Makefiles let you describe the dependencies of processes that rely on other processes.
All you need to know is that when used wisely, you can make a tailored workflow you actually enjoy.

You see makefiles used a lot in C++ programs. That's because it was intended to be used for compiling files. For example:

```
# Makefile example

hello: hello.c
  gcc hello.c -o hello
```

Typing ```make``` within a directory containing a makefile, GNU Make would read the Makefile and build the first target it finds.

If a target "hello" is included, that target is updated.

Typically, the default goal in most make files is to build a program. This usually involves many steps. The syntax is as follows:

```
target: prerequisite prerequisite prerequisite ...
(TAB) commands 
```

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
