---
template: post
title: Ultimate Go Development with Docker
slug: ultimate-go-development-with-docker
draft: true
date: 2019-12-27T20:51:27.221Z
description: >-
  Lately, I've been interested in migrating existing APIs from Node to Go. Using
  docker is great and with Node I finally stumbled upon the ultimate workflow I
  was happy with. A fundamental question still persisted, however: how was I to
  achieve a similar flow with Go. This post illustrates the use of docker
  compose to automate live reloading a go api on code changes, debugging it with
  breakpoints and running tests.
category: development
tags:
  - docker golang delve reload
---
## Intro

Docker in development has proven to work exceptionally well for me because I can automate my own environments and isolate them from each other. Lately, I've been interested in migrating APIs from Node to Go. With Node, I finally stumbled upon the ultimate workflow, but a real problem I had was achieving a similar one with Go. This post illustrates the use of docker compose to automate live reloading a Go API on code changes, debugging it with breakpoints and running tests.
