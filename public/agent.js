const Agents = {
  locationAgent: {
    name: "LocationAgent",
    description: "Verify a location in Spain",

    handler: async function (args, call_id) {
      // Example: call your local API
      const locations = await verifyLocation(args.locationName);
      // Send the response back via DataChannel
      sendEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: call_id,
          output: JSON.stringify({ locations }),
        },
      });

      sendEvent({
        type: "response.create",
      });
    },
  },

  propertyAgent: {
    name: "PropertyAgent",
    description: "Create a property listing after location confirmed.",
    prompt:
      "You are a PropertyAgent. Input: locationName, subLocation, province, type, subType, bedrooms, bathrooms, builtSize. Output: JSON with new property info including property ID.",
    handler: async function (args, call_id) {
      const property = await listingProperty(
        args.locationName,
        args.subLocation,
        args.province,
        args.type,
        args.subType,
        args.bedrooms,
        args.bathrooms,
        args.builtSize
      );

      sendEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: call_id,
          output: JSON.stringify({ property }),
        },
      });

      sendEvent({
        type: "response.create",
      });
    },
  },
};
