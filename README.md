
# GTFS Text-to-Speech Tester

[![NPM version](https://img.shields.io/npm/v/gtfs-tts.svg?style=flat)](https://www.npmjs.com/package/gtfs-tts)
[![David](https://img.shields.io/david/blinktaginc/gtfs-tts.svg)]()
[![npm](https://img.shields.io/npm/dm/gtfs-tts.svg?style=flat)]()

[![NPM](https://nodei.co/npm/gtfs-tts.png?downloads=true)](https://nodei.co/npm/gtfs-tts/)

GTFS Text-to-Speech Tester is a command-line tool that will read all [GTFS](https://gtfs.org) stop names using Text-to-Speech and allow flagging which names need Text-to-Speech values for `tts_stop_name` in `stops.txt`. Using this tool is the quickest way to determine which stops need phoenetic spellings, abbreviations written out, large digits written as words, ordinals written out or other changes so that they can be read. [Read More on GTFS Text-to-Speech](https://docs.google.com/document/d/1LObjgDyiiE6UBiA3GpoNOlZ36li-KKj6dwBzRTDa7VU/edit#heading=h.puwtf1nwatif)

<img width="818" src="https://user-images.githubusercontent.com/96217/131066444-a28f4ba3-6e93-4d20-9d6a-da32234e2350.png">

## Installation

* Install node.js https://nodejs.org/en/download/

* Install `gtfs-tts` globally from npm:

    npm install gtfs-tts -g

## Running

GTFS Text-to-Speech will read GTFS from a local directory or a URL.

If you have GTFS files in a local directory:

    gtfs-tts --gtfsPath ./path/to/your/gtfs

If you want to grab from a URL:

    gtfs-tts --gtfsUrl https://transitfeeds.com/p/marin-transit/345/latest/download

The tool will read every stop listed in `stops.txt` using [your systems text-to-speech engine](https://www.npmjs.com/package/say). If a stop already has a value for `tts_stop_name` it will read that value and then skip to the next.

For each stop that doesn't have a value for `tts_stop_name`, it will ask if the pronunciation was correct and you can respond with:

`y` if correct
`n` if incorrect
`r` to repeat the stop name
`e` to end reading stop names (will export what you have processed thus far)

After it is complete, GTFS Text-to-Speech will export a version of the GTFS where stops with incorrect pronunciation have `***NEEDS VALUE***` added to the `tts_stop_name` column in `stops.txt`. Using this exported stops.txt, you can manually correct each stop that needs a `tts_stop_name` value.

## Alternative setup

You can use a configuation JSON file modeled after `config-sample.json` with values for `gtfsPath`, `gtfsUrl` and `sqlitePath` if you want to avoid having to pass these as parameters every time you run the script.

        // If config.json is in the current working directory
        gtfs-tts

        // Otherwise specify location with `configPath` parameter
        gtfs-tts --configPath ./path/to/config.json

Then, after GTFS import you can re-run and skipImport if using a persistent sqlite database:

        gtfs-tts --configPath ./path/to/config.json --skipImport

## Contributing

Pull requests are welcome, as is feedback and [reporting issues](https://github.com/blinktaginc/node-gtfs-tts/issues).
