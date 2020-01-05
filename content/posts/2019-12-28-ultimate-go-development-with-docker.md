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

## The Goal

We will start with a ready made full stack project. I don't want to teach you how to make a react app or a go api, rather we will focus our attention on building tooling around this full stack project in order to support the ultimate Go development environment with Docker. More specifically, we'll cover using multi-stage builds, docker-compose, live reloading, Traefik, Postgres, testing and debugging with delve locally.

## Getting Started

This tutorial comes with source code. You can either go straight to my [master branch](https://github.com/ivorscott/go-delve-reload/tree/master) and try the completed version for yourself or follow along with the project starter, available under the [starter branch](https://github.com/ivorscott/go-delve-reload/tree/starter).

## Setting Up VSCode

I considered making this tutorial IDE agnostic but there are a few amazing VSCode extensions I'd like to share and the last section fully embraces debugging with VSCode. That being said, you don't need any of these extensions I am about to mention, nor do you need to use the delve debugger, but I highly recommend it. 

Download VSCode if you haven't already (its free). Then install the following extensions:

1. [The Go extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode.Go)

explain in 1-2 sentences

1. [The Docker extension](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-docker)

explain in 1-2 sentences

1. [The hadolint extension](https://marketplace.visualstudio.com/items?itemName=exiasr.hadolint)

explain in 1-2 sentences

Create a `launch.json` file under the `./vscode` folder with the following content:

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

explain in 1-2 sentences

![debug-tab](/media/screen-shot-2020-01-05-at-02.33.20.png "Debug tab in VSCode")

=

![docker-tab](/media/screen-shot-2020-01-05-at-02.33.00.png "Docker tab in VSCode")

## Docker

Docker is

### 7 Essential Concepts

### 1. The Dockerfile

### 2. Docker Images

### 3. Containers

### 4. Container Labels

### 5. Data Persistence: Volumes & Bind mounts

### 6. Networks

### 7. Secrets

## Creating the Dockerfiles

## GNU Make and Docker Compose

## Live Reloading The API

## Self-signed certificates with Traefik

## Setting Up Postgres

## Running Tests

## Debugging With VSCode



## Conclusion
