---
template: post
title: Ultimate Go Development with Docker & Traefik
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
  - docker golang delve reload
---
## Why I'm writing this

Since I started deploying apps to the cloud and leveraging multiple tools like Docker, Portainer, Traefik and Drone, I have been forced to recognize that many of my beloved infrastructure tools use Go. It seemed as if every where I turned I was using some open source go library in my day to day deployment workflow.

Coming from NodeJS, I first struggled to achieve my old workflow in Go, which mostly consisted of live reloading and debugging an api in VSCode.

<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Hey <a href="https://twitter.com/hashtag/Gophers?src=hash&amp;ref_src=twsrc%5Etfw">#Gophers</a>, I&#39;m using VSCode and Docker. I want to live reload a go api and use the debugger.<br><br>Here’s what I have so far: <a href="https://t.co/ybH86LYGU4">https://t.co/ybH86LYGU4</a><br><br>Whenever I tried combining both approaches in one container I had issues. Has anyone done this? I&#39;m super close. <a href="https://twitter.com/hashtag/golang?src=hash&amp;ref_src=twsrc%5Etfw">#golang</a> <a href="https://twitter.com/hashtag/docker?src=hash&amp;ref_src=twsrc%5Etfw">#docker</a></p>&mdash; Ivor Scott (@ivorsco77) <a href="https://twitter.com/ivorsco77/status/1206624510306390016?ref_src=twsrc%5Etfw">December 16, 2019</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>

Unfortunately, I wasn't able to find a way to live reload a go api and debug it at the same time, in the same container. So if you are reading this and have any insights on this I would love to hear from you.

I ended up settling with live reloading an api in one container and then on the fly, or when I needed to, launching a debuggable api in a separate container without live reload. This seemed to be a good compromise because I'm usually only debugging when I know I have a problem. At that point, I can simply launch another container to investigate.

## The Goal

We will start with a completed sample api to focus our attention on building tooling around it to support Docker, docker-compose, multi-stage builds, live reloading, Traefik, Postgres, testing and debugging.

> **Note:** \
> **The majority of this tutorial is IDE agnostic except for the last section on _Debugging With VSCode_.**

### Docker

### Project Starter

### Multi-stage Builds

### Docker Compose

### Live Reload

### Traefik

### Setting Up Postgres

### Running Tests

### Debugging With VSCode

### Conclusion
