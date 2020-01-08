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

## Introduction

This tutorial comes with source code. You can either go straight to my [master branch](https://github.com/ivorscott/go-delve-reload/tree/master) and try the completed version for yourself, or follow along with the project starter available under the [starter branch](https://github.com/ivorscott/go-delve-reload/tree/starter).

We will start with a ready-made full stack project. I don't want to teach you how to make a react app or a go api, rather we will focus our attention on building tooling around a full stack project in order to support the ultimate Go and React development environment with Docker. 

## Contents

We'll be covering:

* Multi-Stage Builds
* Docker Compose
* Live Reloading
* Self-Signed Certificates With [Traefik](https://traefik.io)
* Working with Postgres
* Running Tests
* Debugging With Delve. 

Let's begin.

## Requirements

* [VSCode](https://code.visualstudio.com/)
* [Docker](https://www.docker.com/products/docker-desktop)

## Setting Up VSCode

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

This will help VSCode remotely attach to the delve debugger inside the container. This will change the look of the debug tab in VSCode, providing you with a "Launch remote" debugging button that you can use to debug any breakpoints you have set. More on this in the last section.

![debug-tab](/media/screen-shot-2020-01-05-at-02.33.20.png "Debug tab in VSCode")

Adding the Docker extension also changes the look and feel of the VSCode editor. A new Docker tab should be visible, giving us easy access to manage containers, images, registries, networks and volumes. 

![docker-tab](/media/screen-shot-2020-01-05-at-02.33.00.png "Docker tab in VSCode")

## Why Docker?

Docker allows you to package your app and host it on any operating system. This means no more, "It works on my machine" talk. 

Docker supports the software lifecycle from development to production. With Docker, software delivery doesn't have to be painful and unpredictable. If you're working in a team. It's useful for operators, system admins, build engineers and developers. 

Docker's core belief is that it's possible to deliver software fast and in a predictable fashion. 

![use-docker](/media/screen-shot-2020-01-05-at-13.38.25.png "It works on my machine (Slap) --Use Docker!")

## Docker Basics

There are 3 concepts to know if you're new to Docker.

### 1. Images

A Docker image is your application's binaries, dependencies, and meta data included in a single entity, made up of multiple static layers that are cached for reuse. 

### 2. Dockerfile

A Dockerfile is a recipe for making images. Each instruction forms its own image layer. 

### 3. Containers

A Docker container is an app instance derived from a particular Docker Image. 



## Getting Started

### Creating the API Dockerfile

Create a new `Dockerfile` for the api folder and then open it in your editor.

```
touch api/Dockerfile
```

We start a Dockerfile by referencing a base image. If you wanted to start from completely scratch (an empty container) you would write:

```
FROM scratch
```

Since we're building a go api, we'll use the official [Golang base image](https://hub.docker.com/_/golang) found on DockerHub.

```
FROM golang:latest as base
```

> **Note:**
>
>  
>
> Avoiding using the 
>
> `:latest`
>
>  tag when referencing images. It's best to always pin down an explicit numbered version when referencing images.

Update the first line to:

```
FROM golang:1.13.5 as base
```

Save the file. 

### Multi-Stage

Multi-stage builds help us apply separation of concerns. A multi-stage setup allows you to define different stages of a single Dockerfile to reference or target them later. In our Dockerfile, we declared the name of our first stage `as base`.

Creating additional stages is as easy as declaring another `FROM` statement and giving that stage name. 

For example: 

```
# 2 stage multi-stage example
FROM scratch as base
FROM base as dev
```

Let's add a `LABEL` below our first line.

```
FROM golang:1.13.5 as base

LABEL maintainer="FIRSTNAME LASTNAME <YOUR@EMAIL.HERE>"
```

Labels allow you to add meta data to your Docker image. 

We can copy the api code from our project starter into the docker image so that it will be present inside the container when build the image and run an instance of it. 

We can do this by setting the current working directory to `/api`, which actually represents a path in the container. In doing so, every subsequent command will now occur beneath this directory until we change it. 

```
WORKDIR /apiCOPY . .
```

This has the added effective of moving the entire contents of the project's api folder inside the image.

If we ever want to ignore some files we can create a `.dockerignore` file, which works exactly the same way as `.gitignore` from git. 

### Go modules

Before moving to the next stage, since we are using go modules we should pre-load all the module dependencies the api needs.

[Golang's official blog](https://blog.golang.org/using-go-modules) defines a go module as: 

> a collection of Go packages stored in a file tree with a go.mod file at its root. The go.mod file defines the module’s module path, which is also the import path used for the root directory, and its dependency requirements, which are the other modules needed for a successful build. Each dependency requirement is written as a module path and a specific semantic version.

Append the following line.

```
RUN go mod download
```

On a new line, initiate a new stage for development purposes.

```
# DevelopmentFROM base as dev
```

To preform live reloading and debugging we need to leverage two packages: [CompileDaemon](https://github.com/githubnemo/CompileDaemon) and [delve](https://github.com/go-delve/delve). Let's make sure they are only downloaded within the `dev` stage because we don't need them in production. To do this we need to leverage the `GOPATH`. 

The `GOPATH` is where Go developers installed packages prior to go modules. Let's define the `GOPATH` as an environment variable and add it to the image's `PATH`, so go can find these development packages. Then we'll change the current working directory again to point to our api code. Add the following below the `dev` stage:

```
ENV GOPATH /go
ENV PATH $GOPATH/bin:/usr/local/go/bin:$PATH

WORKDIR $GOPATH/src

RUN go get github.com/go-delve/delve/cmd/dlv
RUN go get github.com/githubnemo/CompileDaemon
```

The `RUN` command allows us to run a command inside an image. Here we have two commands to download both development dependencies on two separate lines. Once we build an image, each line will have its own cached image layer. Changes to an image layer will invalidate that layer and force every subsequent image layer downward to rebuild.

The dev stage is still pointing to `$GOPATH/src`. Let's change that back to where the api code is. In addition, we can `EXPOSE` some ports we will be needing later.

The `EXPOSE` command is just meta data. It serves only as a reminder that these ports need to be opened in the container.

```
WORKDIR /api
# port 4000 ->api port# port 8888 -> debuggable api port# port 2345 -> debugger port
EXPOSE 4000 8888 2345

```

We end with the production stage. We won't be defining this stage in this tutorial. I will leave that task for you. 

```
# ProductionFROM base as prod
```

By now, your api Dockerfile should look something similar to this:

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

### Demo

```
docker build --target dev --tag demo/api ./api
```

The `docker build` command builds the a new docker image referencing the Dockerfile inside the api folder. 

The first flag from the left: `--target` specifies that we only want to target the `dev` stage in the multi-stage setup. The second flag: `--tag` specifies a name we can use to reference the new image, it is tagged `demo/api`.

If you publish a private or public image to DockerHub the format it expects is username/image-name. Since we are not publishing images in this tutorial `demo` doesn't have to be your real username.

While building an image, the terminal output should show each step, or image layer, ending with a success message if successful. 

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
docker build --target dev --tag demo/client:dev ./clientdocker build --target test --tag demo/client:test ./clientdocker build --target prod --tag demo/client:prod ./client
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
      POSTGRES_HOST: db
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
```

At the very bottom of the file we need to create the volumes, networks and secrets need by the containers.

```
volumes:
  postgres:
    external: true
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
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5

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

### Demo

```
docker-compose up
```

```
docker-compose down
```

## Makefiles

Working with Docker will require you too know a series of commands: `docker run`, `docker build` `docker-compose up` etc. Often it's hassle to type all of the various commands even when you know all of them all. 

GNU Make is a tool which controls the generation of executables and other non-source files of a program from the program's source files.

Make gets its knowledge of how to build your program from a file called the makefile, which lists each of the non-source files and how to compute it from other files. When you write a program, you should write a makefile for it, so that it is possible to use Make to build and install the program.

You see makefiles used a lot in C++ programs. That's because it was intended to be used for compiling files. For example:

```
# Makefile example

hello: hello.c
  gcc hello.c -o hello
```

When typing `make` within a directory containing a makefile, GNU Make will read your Makefile and build the first target it finds.

You can also specify a target.

`make hello`

If the target "hello" is included, that target is updated.

Typically, the default goal in most makefiles is to build a program. This usually involves many steps. The syntax is as follows:

```
target: prerequisite prerequisite prerequisite ...
(TAB) commands 
```

Makefiles can make your life a lot easier, helping you make a workflow you actually enjoy by abstracting away long commands to shorter memorable names. For example, the following command could abstract away a series of commands:

```
make api

# is shorter than

docker network create postgres
docker-compose up api db
```

Before using Makefiles, you need to understand Phony Targets.

### Phony Targets

Targets and prerequisites don't have to be files. This is typically the case when compiling executables but for you a target is just a label representing a command script.

Targets that do not represent files are known as phony targets.

Phony targets are always executed. Since makefile can distinguish between a file target and a phony target conflicts may arise in development. For example, your in a directory with a file named test and inside a makefile in the same directory you have a target name test without prerequisites:

```
test: 
    echo test something
```

Running make test in this scenario may not work as you expect. The output of this command would be `test is up to date`. This is because GNU make sees the test file and then the target without prerequisites and determines that you don't have any commands to perform because everything is up to date. GNU is make does want to perform an unnecessary action. This is an intended optimisation needed for compiling executables. Most of the time, if you are using GNU make to compile executable files you don't want to compile files that don't need to be compiled because they haven't changed.

You can by pass this by indicating that the target is a phony target. The phony target declaration can appear anywhere in the makefile, above or below the target it relates to.

```
test:
    echo test something

.PHONY: test
```

With this, `make test` finally runs the command, and no longer shows the test is up to date response.

Just remember it's only necessary to use `.PHONY: target` when there is a filename conflict with a target defined in a makefile. In the above example, if the test file didn't exist than there would had been no reason to apply .PHONY: test. 

Alright, that's it for makefiles. You can read more about PHONY Targets [here](https://www.gnu.org/software/make/manual/html_node/Phony-Targets.html). In this tutorial project you won't need them but you should be aware of them and how they work.

## Creating The Project Makefile

Create a `makefile` in your project root and open it. 

```
touch makefile
```

By default, when you run docker-compose up any networks you define in your docker-compose.yml file will be created for you if they don't externally exist. In our case, we have defined that our networks are external:

```
networks:
  postgres:
    external: true
```

This means we still that it is our job to create them. I did this partly for readability and to share a more advanced makefile example with targets and prerequisites. By default, if we let docker-compose create our network by leaving out the `external: true` code line. docker-compose would have created a network name called go-delve-reload_postgres, which is essentially the project root directory name and the network name connected with an underscore.

Review the following code.

```
#!make

NETWORKS="$(shell docker network ls)"
VOLUMES="$(shell docker volume ls)"
SUCCESS=[ done "\xE2\x9C\x94" ]

all: postgres-network
	@echo [ starting client '&' api... ]
	docker-compose up client api db

postgres-network:
ifeq (,$(findstring postgres,$(NETWORKS)))
	@echo [ creating postgres network... ]
	docker network create postgres
	@echo $(SUCCESS)
endif

postgres-volume:
ifeq (,$(findstring postgres,$(VOLUMES)))
	@echo [ creating postgres volume... ]
	docker volume create postgres
	@echo $(SUCCESS)
endif

api: postgres-network
	@echo [ starting api... ]
	docker-compose up api db

down:
	@echo [ teardown all containers... ]
	docker-compose down
	@echo $(SUCCESS)
```

Makefile can contain variables. The code above creates a NETWORKS variable by extracting the output of the docker network command.

`shell docker network ls`

The `shell` function helps makefiles communicate with the world outside of make and performs the same function that backquotes (‘`’) perform in most shells. In other words, it evaluates the output of the command, this is called command expansion.

With this variable, we test if we have already created the postgres network, if it's equal to a null value aka `$(null,$(findstring postgres,$(NETWORKS))` then the network will be created. Notice how the first argument in the outer most parentheses is actually empty and followed by a comma --this is the proper syntax.

```
ifeq (,$(findstring postgres,$(NETWORKS)))
	# do something
endif
```

The SUCCESS variable is will be rendered in the terminal output. The cryptic code within a string is just the  Unicode character representation of a checkmark. It's only used here to improve the developer experience in the terminal.

Executing the api target with make api will first execute the prerequisite target postgres-network before running additional commands to describe the step in an echo statement and then perform a task with docker-compose, in this case we are starting the api and db containers only.

Since the all target is the first target in the file, executing make in the terminal would produce a similar result but would include the client container as well. Without the @ symbol any command being executed would also be printed in the terminal output. Use the @ symbol when you want to hide the command being run from the terminal output.

### Demo

Run the following command and open http://localhost:3000 in your browser.

```
make
```

If you scroll down you will see we are already receiving data from the backend. Now teardown all the containers:

```
make down
```

## Live Reloading The API

No that you have have an understanding of docker-compose and makefiles let's wrap this tutorial up. The next feature is dope: live reloading you go api!

If you remember, we already installed CompileDaemon in the dev stage of the api docker image. Let's finally use it. Under the api container service in your docker-compose.yml file, add the following code.

```
command: CompileDaemon --build="go build -o main ./cmd/api" --command=./main
```

Now your api container service should look like this:

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
    command: CompileDaemon --build="go build -o main ./cmd/api" --command=./main
```

That's it!

### Demo

```
make api
```

Open the browser to http://localhost:4000/. Then in your editor navigate to /api/internal/api/handlers.go. Change the  "Hello there.." output of the home handler and save. Watch the terminal restart before your eyes. Go back to the browser and refresh!

![](/media/this-is-how.gif)

### 

## Self-signed certificates with Traefik

Traefik is a cloud native edge router from [Containous](https://containo.us/). 

\[Explain]

We always want to replicate the production environment as much as possible when developing locally. We do this by using self-signed certificates. Luckily Traefik has us covered and its super easy to use.

Add the following code to the top of you docker-compose.yml file:

```
version: "3.7"
services:
  traefik:
    image: traefik:v2.1.1
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

### Demo

Navigate to https:/localhost:4000/products to see Traefik in action.

When viewing the api route in the browser, you will see the "Your connection is not private" message. This is common when using self-signed certificates.

Simply click "Advanced", and then "Proceed to ... (unsafe)".

Now do the same for the react app. Navigate to https:/localhost:3000.

In a production environment, working with Traefik is not much different. You just need to ensure your DNS is setup correctly and that you have ownership of the domain names you wish to use. There's plenty of articles on how to use Traefik in production and if you run into issues you can always post your question on the [Containous community forum](https://community.containo.us/) or see if your question has already been answered. 

## Debugging Postgres In The Terminal

We already have postgres setup but we still haven't discussed how to interact with it. Eventually you're going to want to enter the running postgres container yourself to make queries or debug. There three ways we can do this.

Add the following code to your make file

```
exec:
	@echo [ executing $(cmd) in $(service) ]
	docker-compose exec -u $(user) $(service) $(cmd)
	@echo $(SUCCESS)

debug-db:
	@echo [ debugging postgres database... ]
	@make exec user="$(POSTGRES_USER)" service="$(POSTGRES_HOST)" cmd="bash -c 'psql --dbname $(POSTGRES_DB)'"
```

The postgres container comes with a basic command line interface with postgres. This is your first option to start poking around. Run:

```
make debug-db
```

Inside the container run:

```
\dt
select * from products;
```

Some issues the command `select * from products` won't work because its missing a semi-colon at the end of the statement. Also there's no auto-completion or syntax highlighting support. For these features we need [pgcli](https://www.pgcli.com/). 

Replace the old debug-db target with this new one.

```
debug-db:
	@echo [ debugging postgres database... ]
	@docker run -it --rm --net postgres dencold/pgcli postgresql://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@$(POSTGRES_HOST):5432/$(POSTGRES_DB)
```

### Demo

Pgcli is such a better interface to work with. 

```
make down
make debug
```

Now inside the container run:

```
\dt
select name, price from products
```

This is great we now have a user friendly terminal experience. For some, this may be all you need. In the next section, we will see how you can work with postgres in the browser.

## PGAdmin4: Debugging Postgres In The Browser

Add the following code in the Browser.

```
  pgadmin:
    image: dpage/pgadmin4
    environment:
      PGADMIN_DEFAULT_EMAIL: test@example.com
      PGADMIN_DEFAULT_PASSWORD: "SuperSecret"
    depends_on:
      - db
    networks:
      - postgres
      - traefik-public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.pgadmin.tls=true"
      - "traefik.http.routers.pgadmin.rule=Host(`pgadmin.local`)"
      - "traefik.http.routers.pgadmin.entrypoints=websecure"
      - "traefik.http.services.pgadmin.loadbalancer.server.port=80"
    restart: unless-stopped
```

### Demo

Navigate to https://pgadmin.local in your browser. The the email and password is the same email and password you added to the pgadmin container service config under `PGADMIN_DEFAULT_EMAIL` and `PGADMIN_DEFAULT_PASSWORD` environment variables.

## Making Postgres Database Backups

Making database backups of your postgres database is straight forward. This is a good this to explain how the your postgres database got seeded with data in the first place. Navigate to api/scripts/create-db.sh.

\[Explain]

Add the following command to your makefile.

```
dump:
	@echo [ dumping postgres backup for $(POSTGRES_DB)... ]
	@docker exec -it $(POSTGRES_HOST) pg_dump --username $(POSTGRES_USER) $(POSTGRES_DB) > ./api/scripts/backup.sql
	@echo $(SUCCESS)
```

### Demo

```
make dump
```

## Running Tests

Add some more commands to your make file to test both the client react app and the go api.

```
test-client:
	@echo [ running client tests... ]
	@make exec service="client" cmd="npm test"

test-api:
	@echo [ running api tests... ]
	@make exec service="api" cmd="go test -v ./..."
```

### Demo

```
make
make test-client
make test-api
```

Both commands essentially execute test commands in the running containers. While not necessary with unit tests, you should be aware of the fact that you can do this without creating additional containers specifically for tests in your docker-compose.yml file. 

Another tip is you can build a test image targeting a test stage in a multi-stage build setup within the CI tool of your choice. You won't even need to run the image after building. If the build succeeds the tests have passed. If the test image fails to build something went wrong.

```
docker build --target test --tag reload/client:test ./client
```

## Debugging With VSCode

Finally let's debug our go api with breakpoint in VSCode using delve. If you remember, we already added the .vscode/launch.json file necessary to attach to the delve debugger in the container. In addition to this, we also added the delve binaries to our dev stage in the api dockerfile. Before we start debugging add the following container service to your docker-compose.yml file.

```
  debug-api:
    build:
      context: ./api
      target: dev
    secrets:
      - postgres_db
      - postgres_host
      - postgres_user
      - postgres_passwd
    environment:
      ADDR_PORT: 8888
      POSTGRES_HOST: /run/secrets/postgres_host
      POSTGRES_DB: /run/secrets/postgres_db
      POSTGRES_USER: /run/secrets/postgres_user
      POSTGRES_PASSWORD: /run/secrets/postgres_passwd
    ports:
      - 2345:2345
    networks:
      - postgres
      - traefik-public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.debug-api.tls=true"
      - "traefik.http.routers.debug-api.rule=Host(`debug.api.local`)"
      - "traefik.http.routers.debug-api.entrypoints=websecure"
      - "traefik.http.services.debug-api.loadbalancer.server.port=8888"
    security_opt:
      - "seccomp:unconfined"
    tty: true
    stdin_open: true
    command: dlv debug --accept-multiclient --continue --headless --listen=:2345 --api-version=2 --log ./cmd/api/
```

Add the following target to you make file as well:

```
debug-api:
	@echo [ debugging api... ]
	docker-compose up traefik debug-api db pgadmin
```

### Demo

```
make debub-api
```

### Demo

## Conclusion

\[Recap. What makes this the ultimate setup. What to take away.] Happy coding.
