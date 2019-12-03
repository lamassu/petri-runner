# Net structure

## Places

Places are numbered, starting from 0.

## Transitions

* List of:
  * srcPlace, srcTokenCount
* List of:
  * dstPlace, dstTokenCount

## Example JSON

```javascript
{
  places: [
    {
      name: "Hi",
      tags: ["one", "two"],
      tokenCount: 0
    }
  ],
  transitions: [
    {
      name: "hi",
      tags: ["one", "two"],
      inputs: [
        srcPlace: 'Hi',
        srcTokenCount: 2,
      ],
      outputs: [
        {
          dstPlace: 'Ho',
          dstTokenCount: 1
        }
      ]
    }
  ]
}
```

## Marking

```javascript
{
  marking: [
    {
      place: 3,
      tokenCount: 1
    },
    {
      place: 7,
      tokenCount: 3
    }
  ]
}
```

# Serialization

It's useful to have a compact, portable, and extremely simple serialization format. This may not be necessary at first if we're only doing this in JavaScript. **Low priority.**

For the net, we write a series of transitions. Each transition has two lists (src, then dst) of places and tokens.
Assume we are using 16 bit integers for everything. Then, the serialization is:

record_type is defined here to be: 0xbf0e
[ record_type, num_items, srcPlace, srcTokens, srcPlace, srcTokens, ..., num_items, destPlace, destTokens, destPlace, destTokens, ...]

For the marking, it is:

record_type is defined here to be: 0x716a
[ record_type, place, count, place, count, ... ]

Note: we are using randomly generated numbers for record_type so that they are easily recognizeable.

# Running (interpreting)

* Marking: same as JSON object.
* Transitions: lookup table, indexed by source place.

At rest, the net is in a static state, entirely determined by its marking. At this point, we need to handle events in order to fire active transitions.

There are a few classes of firing events but all of them are caused by firing events:

* An event comes into the PN with a record that identifies a transition to be fired.
* A built-in event fires the transition. E.g., a timeout.
* The transition is set to auto-fire. It fires immediately upon activation.

If an event attempts to fire a transition that is not active, the marking does not change, but we can emit an error event. Upon successful firing of a transition, the record that fired the transition is appended to the append-only log that consititutes the net history at that path.

## Handling an incoming firing event

When a firing event comes in, we must look up the associated transition. Then we must determine if that transition is active. If yes, we fire the transition. If not, we emit an error event.

transitionLocatorLookup[transition-locator] = transition_id
transitionLookup[transition_id] = transition_record

## External events

External events will be defined by a naming and labelling convention in the net. A lowercase tag that's not a reserved word represents an event source. The transaction name is the firing key.

## Timeouts

Initiate a JavaScript timeout upon firing. The timeout will initiate a special timeout-type event that will be handled in the framework of other firing events.

## Auto-fire

After firing any transition, check if any of the events in the new markings are auto-fire. If so, emit events to fire each of them.

## Firing a transition

Firing a transition means:

* Recording the firing event in the history.
* Changing the marking.
* Emitting an event indicating the firing.
* Emitting an error event on a failed firing.

To check if a transition is active:

* For each srcPlace and srcTokenCount, check if the srcPlace has at least srcTokenCount tokens.
* Optimize this check by caching, and invalidating the cache on any marking update that affects one of the source places.

To change the marking:

* For each source place, decrement the source place by the associated srcTokenCount.
* For each destination place, increment the destination place by the associated dstTokenCount.

## Guards

https://github.com/dhall-lang/dhall-lang/wiki/Cheatsheet
https://github.com/soney/jsep/blob/master/src/jsep.js

For starters, can check simple guards with jsep (or even restricted jsep [removeAllBinaryOps]), then do a JavaScript eval on the sanitized string.

## Gluing

Gluing according to our normalized subnet structure should be straightforward. It should test as many things as possible to validate the subnet at net.

Then it should remove the parent scaffolding transitions, insert the subnet intermediate transactions, and hookup the initial and terminal subnet transitions.

## Parsing gspn file

We need a tool that parses the gspn xml file to our JSON format.

Start with xml2json, consider camaro. Camaro will probably be safer due to explicitly defining xml.

## Priorities

1. Parse gspn file.
2. Glue nets.
3. Run net.
4. Built-in timeouts.
5. Auto-fire transitions.
