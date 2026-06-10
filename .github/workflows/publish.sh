name: Publish

on:
  push:
    tags: 
      - "*"

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: install dependencies
        run: |
          yarn

      - name: build ts to js
        run: |
          yarn build

      - name: setup global npm config
        run: |
          echo "//npm.pkg.github.com/:_authToken=${{ github.token }}" >> ~/.npmrc

      - name: publish
        run: |
          yarn publish