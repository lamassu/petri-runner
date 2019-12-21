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

1. Parse gspn file. (v)
2. Glue nets. (v)
3. Run net.
4. Folds. (built-in via mostjs streams).
5. Built-in timeouts.
6. Auto-fire transitions.
7. Loop constraints.

## Firing

We can model the PN as a stream transformer. The input stream is a stream of records of the type:

```javascript
{
  transitionName: 'badPhoneNumber',
  data: { phoneNumer: '97253162763726' }
}
```

The stream is transformed into a stream of successful firing records and warning records:

```javascript
{
  recordType: 'firing',
  transitionId: 'badPhoneNumber___2__3__8__11__19',
  data: { phoneNumer: '97253162763726' },
  marking: {}
}
```

And...

```javascript
{
  recordType: 'warning',
  warningType: 'transitionNotActive',
  info: {
    transitionId: 'badPhoneNumber___2__3__8__11__19',
    data: { phoneNumer: '97253162763726' },
    srcPlace: 'xxx',
    dstPlace: 'yyy'
  },
  marking: {}
}
```

A single source record can lead to multiple firing records, if automatic transitions exist. In fact, the net can start firing before any record events arrive from the source.

## Looking up a transition to fire

A big question is how will the source stream name the transitions it wants to fire.

Let's look at a transition, say ``badPhoneNumber___2__3__8__11__19``. If we split it by the ``___`` token, we get ``name`` as the first part and ``context`` as the second part.

If we provide only *name*, we have to worry about two issues:

1. That name is used in multiple subnets. This can easily be solved by providing the subnet name, as well.
2. The subnet that the transition is in was integrated in multiple places in the net and more than on of them is currently active. In this case, we can:
  * Fire all of them. This could make sense. We could throw a warning as well.
  * Fire none of them and throw an error. This doesn't sound good, as it turns our nice static design into a runtime error.

Another route is to provide the entire context on each firing. This is very cumbersome to use, though.

Another idea is to statically analyze whether the group of *name* transitions in the net can be active at the same time. This can be encoded into a lookup table so it can be used to determine at designe time whether a given transition needs more than just a name. This can be done for subnet namespacing, as well, although that might not be necessary. Alternately, we can only validate nets that don't have name-conflicting transitions.

Using reachability graph, check if, for a giving marking state, multiple transitions of the same *name* can change the state. Can use R.countBy to do this easily. Test on some fake nets.

For the meantime, we can assume that *name* is sufficient.

## Timeouts

There are a few options:

* When transition is active, create a delayed firing. This is too messy.
* Start a timer when transition is active. Timer is reset when transition becomes inactive or transition fires. If timer has expired, the transition becomes an *auto* transition. The question is how do we process this auto event? We need a delay event that would then check status. We can possibly cancel the delay event if the status changes. An easy way to do this is to merge in an ``_.at(30000)`` stream and instead of a firing event, give it a ``timeout_check event``. There's no real point in canceling this.

## Transition classes

We already met a class of transitions, namely all transitions with a given *name*. We can define other arbitrary classes, based on tags. For instance, we could define a *user_ok* class, that indicates that a user has confirmed the screen. We can statically analyze that no two transitions of this class can ever fire, similarly to how we do it in the case of *names*.

This could much simplify code design, as every confirm button press could just generate a *user_tap* event. If done in combination with timeouts, we could really simplify many screens. We could do the same for *user_abort*. We could even create a *tap_or_timeout_30s* tag, although that's not a huge improvement over *user_tag,timeout_30s*.

## Hooking up streams

**Source stream**: Events from the machine/user.
**Firing stream**: Scan over events stream with intial marking to produce new marking and firing/error records. Error records should show the unchanged last marking for easy scanning.

**Button presses**: User input is a stream that is merged into *source stream*.
**Bill validator output**: Bill validator output events are merged into *source stream*.
**Bill validator input**: Bill validator input events are transformed from the firing stream and this is merged into the *bill validator output* stream. It is also tapped by the bill validator device to send commands.

Same for other peripherals.

**Screen**: *firing stream* is transformed into this.

**logic**: This one transforms *firing stream* and possibly others and feeds back into *source stream*. Since it's circular, we might need: https://github.com/mostjs-community/subject

However, we might not need *firing stream* as an input. If the logic part needs history, it can fold over *source stream* and just feed into *firing stream*. Example is *runAmlKycTier in AmlKyc subnet. We need info about the transaction in order to determine this. We also need to know when to fire the transition, so the circular stuff would help here. Also, although the source stream has history, we only know what actually fired from the *firing stream*.

This seems to be exactly the problem cycle.js was invented to handle.

Can be handled with RxJs via a subject: https://stackoverflow.com/questions/34343869/how-to-handle-circularly-dependent-observables-in-rxjs/34364261#34364261
Can use ``imitate`` from xstream.
For mostjs, use: https://github.com/mostjs-community/subject
For callbags: https://github.com/krawaller/callbag-proxy

This is pretty confusing, but it looks like most-subject works just like xstream.imitate. See play/most-attach.js. However, doesn't seem to be working right.

Try example with callbags and xstream.

* Callbags could be interesting. Test file doesn't seem to work with combine or merge.

**Summary**: latest play/most-attach.js seems to work well. Try going with this.

## Network down

How do we handle something like network being down? Probably based to handle this with timeouts. The behavior is the same as if the user walks away from the machine. One difference is that we can also display a network-down screen. This should probably be handled outside the net. It can't be modeled well with our compisition model.
