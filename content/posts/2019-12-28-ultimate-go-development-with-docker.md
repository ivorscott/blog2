---
template: post
title: Ultimate Go Development with Docker
slug: ultimate-go-development-with-docker
draft: true
date: 2019-12-27T20:51:27.221Z
description: >-
  IntroDocker in development has proven to work exceptionally well for me
  because I can automate my own environments and isolate them from each other.
  Lately, I've been interested in migrating APIs from Node to Go. With Node, I
  had the ultimate workflow, but I had a problem achieving a similar one with
  Go. This post illustrates the use of docker compose to automate live reloading
  a Go API on code changes, debugging it with breakpoints and running tests.
category: development
tags:
  - docker golang delve reload
---
## Intro

Docker in development has proven to work exceptionally well for me because I can automate my own environments and isolate them from each other. Lately, I've been interested in migrating APIs from Node to Go. With Node, I had the ultimate workflow, but I had a problem achieving a similar one with Go. This post illustrates the use of docker compose to automate live reloading a Go API on code changes, debugging it with breakpoints and running tests.
