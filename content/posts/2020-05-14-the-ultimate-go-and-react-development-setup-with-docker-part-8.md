---
template: post
title: CICD with Portainer and Drone pt.8
slug: ultimate-go-react-development-setup-with-docker-part8
draft: false
date: 2020-08-14T9:10:15.296Z
description: >-

category: "Go and React Series"
tags:
  - Docker Golang React Swarm Traefik Portainer Drone CI
socialImage: "/media/part8.jpg"
---

<!-- PART OF A SERIES -->
<center>
<i>
  <a href ="/category/go-and-react-series/">Part of the Go and React Series</a>
</i>
</center>

![](/media/part8.jpg)

# Introduction

[Part 7](/ultimate-go-react-development-setup-with-docker-part7) was about deploying on a production Swarm with Traefik. This post covers CICD with Portainer and Drone CI.

We focus on:

- [Getting Started](#getting-started)
- [Protainer](#protainer)
- [Drone CI](#drone-ci)

## Requirements

- [VSCode](https://code.visualstudio.com/)
- [Docker](https://www.docker.com/products/docker-desktop)
- [DockerHub Account](https://hub.docker.com/)
- [Digital Ocean Account](https://m.do.co/c/12762445c6b3)
- [Auth0 Account](https://auth0.com/)

# Getting Started

Clone the project repo and checkout `part7`.

```bash
git clone https://github.com/ivorscott/go-delve-reload
cd go-delve-reload
git checkout part7
```

Please review [Setting Up VSCode](/ultimate-go-react-development-setup-with-docker#setting-up-vscode) to avoid intellisense errors in VSCode. This occurs because the Go module directory is not the project root.

# Protainer

# Drone CI
