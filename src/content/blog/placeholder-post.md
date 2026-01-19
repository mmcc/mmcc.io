---
title: on video complexity
description: Why simple-looking video is actually hard.
date: 2026-01-15
tags:
  - video
  - engineering
---

Video on the web looks simple. You upload a file, get a URL, put it in a player. Done.

Except it's not.

## the iceberg

What you see: a play button. What's underneath:

- Adaptive bitrate streaming (HLS, DASH)
- Transcoding to dozens of renditions
- CDN distribution across continents
- DRM for content protection
- Analytics and QoE monitoring
- Live vs VOD pipelines
- Codec negotiations (H.264, HEVC, VP9, AV1)

Each of these is its own rabbit hole.

## why it matters

Most developers don't need to understand all of this. That's the point of good infrastructure—it abstracts complexity so you can focus on your actual product.

But when something breaks at 2am and your stream is buffering for 100k concurrent viewers, you'll wish you understood the iceberg.

## the abstraction game

The best video tools expose just enough control without drowning you in options. It's a hard balance. Too simple and power users bounce. Too complex and everyone bounces.

We're still figuring this out.
