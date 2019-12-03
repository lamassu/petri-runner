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
  transitions: [
    {
      sources: [
        srcPlace: 2,
        srcTokenCount: 2,
      ],
      targets: [
        {
          dstPlace: 4,
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

For the net, we write a series of transitions. Each transition has two lists (src, then dst) of places and tokens.
Assume we are using 16 bit integers for everything. Then, the serialization is:

record_type is defined here to be: 0xbf0e
[ record_type, num_items, srcPlace, srcTokens, srcPlace, srcTokens, ..., num_items, destPlace, destTokens, destPlace, destTokens, ...]

For the marking, it is:

record_type is defined here to be: 0x716a
[ record_type, place, count, place, count, ... ]

Note: we are using randomly generated numbers for record_type so that they are easily recognizeable.
